// Battle Notify: an in-process pixel renderer. No gameplay reads/writes or key synthesis.
// The linked Toolbox sends premultiplied BGRA frames through a local named pipe.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <d3d9.h>
#include <d3d11_1.h>
#include <d3dcompiler.h>
#include <stdint.h>
#include <stdio.h>
#include <vector>
#include <algorithm>
#include "MinHook.h"
#ifndef BN_BUILD_ID
#define BN_BUILD_ID "development"
#endif

template<class T> static void drop(T*& p) { if (p) { p->Release(); p=nullptr; } }
static SRWLOCK guard=SRWLOCK_INIT;
static std::vector<uint8_t> pixels;
static uint32_t fw=0,fh=0,flags=0,frameVersion=0,moveSequence=0;
static int fx=0,fy=0;
static bool dragging=false,pressedLock=false;
static int dragX=0,dragY=0;
static HWND gameWindow=nullptr;
static WNDPROC oldProc=nullptr;
static volatile LONG dirtyMove=0,dirtyLock=0,dirtyReady=0;
static volatile LONG lastRendered=0;
static uint32_t canvasW=0,canvasH=0;
static POINT canvasOrigin={};
static uint32_t clientW=0,clientH=0;
static bool exclusive=false;
static const char* graphics="waiting";
static HMODULE ownModule=nullptr;
static DWORD lastFrameAt=0;
static volatile LONG peerConnected=0;
static volatile LONG workerStage=0;
static volatile LONG inputOwned=0;
extern "C" __declspec(dllexport) LONG BNRendererStatus() { return workerStage; }
static bool active() { return (flags&1) && fw && fh && !pixels.empty() && GetTickCount()-lastFrameAt<3000; }
static void clampPosition() {
    fx=std::max(0,std::min(fx,std::max(0,(int)canvasW-(int)fw)));
    fy=std::max(0,std::min(fy,std::max(0,(int)canvasH-(int)fh)));
}
static LRESULT CALLBACK windowProc(HWND h,UINT m,WPARAM w,LPARAM l) {
    if (!peerConnected) return oldProc ? CallWindowProcW(oldProc,h,m,w,l) : DefWindowProcW(h,m,w,l);
    bool consumed=false;
    // Never drop the matching release after intercepting a preview press.
    bool ending=m==WM_LBUTTONUP && InterlockedCompareExchange(&inputOwned,0,0);
    bool acquired=false;
    if (ending) { AcquireSRWLockExclusive(&guard);acquired=true; }
    else acquired=TryAcquireSRWLockExclusive(&guard)!=FALSE;
    if (acquired) {
        bool edit=active() && (flags&2);
        int x=GET_X_LPARAM(l),y=GET_Y_LPARAM(l);
        if(clientW && clientH) {x=MulDiv(x,canvasW,clientW);y=MulDiv(y,canvasH,clientH);}
        if (!edit && (dragging || pressedLock)) {
            dragging=false;pressedLock=false;
            // Input interception is restricted to explicitly enabled preview dragging.
        }
        if (edit && m==WM_LBUTTONDOWN && x>=fx && x<fx+(int)fw && y>=fy && y<fy+44) {
            pressedLock=x>=fx+(int)fw-122;
            dragging=!pressedLock;dragX=x-fx;dragY=y-fy;consumed=true;InterlockedExchange(&inputOwned,1);
        } else if (edit && m==WM_MOUSEMOVE && dragging) {
            fx=x-dragX;fy=y-dragY;clampPosition();moveSequence++;
            InterlockedExchange(&dirtyMove,1);consumed=true;
        } else if (m==WM_LBUTTONUP && (dragging || pressedLock || ending)) {
            if (pressedLock) InterlockedExchange(&dirtyLock,1);
            dragging=false;pressedLock=false;InterlockedExchange(&inputOwned,0);InterlockedExchange(&dirtyMove,1);consumed=true;
        } else if (m==WM_KILLFOCUS || m==WM_CAPTURECHANGED || m==WM_CANCELMODE) {
            dragging=false;pressedLock=false;InterlockedExchange(&inputOwned,0);
        }
        ReleaseSRWLockExclusive(&guard);
    }
    if (consumed) return 0;
    return oldProc ? CallWindowProcW(oldProc,h,m,w,l) : DefWindowProcW(h,m,w,l);
}
// Called on the game render thread. Keep the original procedure in the chain.
static bool recordCanvas(HWND h,uint32_t width,uint32_t height,bool full,const char* api) {
    if (!h || !IsWindowVisible(h) || width<200 || height<150) return false;
    if (gameWindow && IsWindow(gameWindow) && gameWindow!=h) return false;
    if (gameWindow!=h) {
        gameWindow=h;
        oldProc=(WNDPROC)SetWindowLongPtrW(h,GWLP_WNDPROC,(LONG_PTR)windowProc);
    }
    POINT origin={};ClientToScreen(h,&origin);RECT client={};GetClientRect(h,&client);
    if (canvasW!=width || canvasH!=height || exclusive!=full || graphics!=api || canvasOrigin.x!=origin.x || canvasOrigin.y!=origin.y || clientW!=(uint32_t)client.right || clientH!=(uint32_t)client.bottom) {
        canvasOrigin=origin;clientW=client.right;clientH=client.bottom;
        canvasW=width;canvasH=height;exclusive=full;graphics=api;
        clampPosition();InterlockedExchange(&dirtyReady,1);
    }
    return true;
}

// Direct3D 9 / 9Ex: all render state is saved and restored around our quad.
typedef HRESULT (WINAPI *EndSceneFn)(IDirect3DDevice9*);
typedef HRESULT (WINAPI *ResetFn)(IDirect3DDevice9*,D3DPRESENT_PARAMETERS*);
static EndSceneFn originalEndScene=nullptr;
static ResetFn originalReset=nullptr;
static IDirect3DDevice9* device9=nullptr;
static IDirect3DTexture9* texture9=nullptr;
static uint32_t texture9W=0,texture9H=0,uploaded9=0;
struct Vertex9 { float x,y,z,rhw;D3DCOLOR color;float u,v; };
static HRESULT WINAPI render9(IDirect3DDevice9* d) {
    if (!peerConnected) return originalEndScene(d);
    if (TryAcquireSRWLockExclusive(&guard)) {
        IDirect3DSwapChain9* swap=nullptr;IDirect3DSurface9* back=nullptr;D3DPRESENT_PARAMETERS p={};
        if (SUCCEEDED(d->GetSwapChain(0,&swap))) { swap->GetPresentParameters(&p);swap->GetBackBuffer(0,D3DBACKBUFFER_TYPE_MONO,&back);swap->Release(); }
        D3DDEVICE_CREATION_PARAMETERS cp={};d->GetCreationParameters(&cp);
        IDirect3DSurface9* surface=nullptr;D3DSURFACE_DESC desc={};
        if (SUCCEEDED(d->GetRenderTarget(0,&surface))) surface->GetDesc(&desc);
        bool target=surface && surface==back && recordCanvas(p.hDeviceWindow?p.hDeviceWindow:cp.hFocusWindow,desc.Width,desc.Height,!p.Windowed,"d3d9");
        drop(surface);drop(back);
        if (device9!=d) { drop(texture9);device9=d;texture9W=texture9H=uploaded9=0; }
        if (target && active()) {
            if (!texture9 || texture9W!=fw || texture9H!=fh) {
                drop(texture9);texture9W=fw;texture9H=fh;uploaded9=0;
                d->CreateTexture(fw,fh,1,D3DUSAGE_DYNAMIC,D3DFMT_A8R8G8B8,D3DPOOL_DEFAULT,&texture9,nullptr);
            }
            if (texture9 && uploaded9!=frameVersion) {
                D3DLOCKED_RECT r={};
                if (SUCCEEDED(texture9->LockRect(0,&r,nullptr,D3DLOCK_DISCARD))) {
                    for (uint32_t y=0;y<fh;y++) memcpy((uint8_t*)r.pBits+y*r.Pitch,pixels.data()+y*fw*4,fw*4);
                    texture9->UnlockRect(0);uploaded9=frameVersion;
                }
            }
            IDirect3DStateBlock9* state=nullptr;
            if (texture9 && SUCCEEDED(d->CreateStateBlock(D3DSBT_ALL,&state))) {
                state->Capture();
                D3DVIEWPORT9 vp={0,0,desc.Width,desc.Height,0,1};d->SetViewport(&vp);
                d->SetVertexShader(nullptr);d->SetPixelShader(nullptr);
                d->SetFVF(D3DFVF_XYZRHW|D3DFVF_DIFFUSE|D3DFVF_TEX1);d->SetTexture(0,texture9);
                d->SetRenderState(D3DRS_ZENABLE,FALSE);d->SetRenderState(D3DRS_ZWRITEENABLE,FALSE);
                d->SetRenderState(D3DRS_ALPHATESTENABLE,FALSE);d->SetRenderState(D3DRS_ALPHABLENDENABLE,TRUE);
                d->SetRenderState(D3DRS_SRCBLEND,D3DBLEND_ONE);d->SetRenderState(D3DRS_DESTBLEND,D3DBLEND_INVSRCALPHA);
                d->SetRenderState(D3DRS_BLENDOP,D3DBLENDOP_ADD);d->SetRenderState(D3DRS_SEPARATEALPHABLENDENABLE,FALSE);
                d->SetRenderState(D3DRS_CULLMODE,D3DCULL_NONE);d->SetRenderState(D3DRS_SCISSORTESTENABLE,FALSE);
                d->SetRenderState(D3DRS_LIGHTING,FALSE);d->SetRenderState(D3DRS_FOGENABLE,FALSE);
                d->SetRenderState(D3DRS_STENCILENABLE,FALSE);d->SetRenderState(D3DRS_SRGBWRITEENABLE,FALSE);
                d->SetRenderState(D3DRS_COLORWRITEENABLE,15);
                d->SetTextureStageState(0,D3DTSS_COLOROP,D3DTOP_MODULATE);d->SetTextureStageState(0,D3DTSS_COLORARG1,D3DTA_TEXTURE);d->SetTextureStageState(0,D3DTSS_COLORARG2,D3DTA_DIFFUSE);
                d->SetTextureStageState(0,D3DTSS_ALPHAOP,D3DTOP_MODULATE);d->SetTextureStageState(0,D3DTSS_ALPHAARG1,D3DTA_TEXTURE);d->SetTextureStageState(0,D3DTSS_ALPHAARG2,D3DTA_DIFFUSE);
                d->SetTextureStageState(1,D3DTSS_COLOROP,D3DTOP_DISABLE);d->SetTextureStageState(1,D3DTSS_ALPHAOP,D3DTOP_DISABLE);
                d->SetSamplerState(0,D3DSAMP_MINFILTER,D3DTEXF_POINT);d->SetSamplerState(0,D3DSAMP_MAGFILTER,D3DTEXF_POINT);d->SetSamplerState(0,D3DSAMP_MIPFILTER,D3DTEXF_NONE);d->SetSamplerState(0,D3DSAMP_SRGBTEXTURE,FALSE);
                float x=(float)fx-.5f,y=(float)fy-.5f;
                Vertex9 v[]={{x,y,0,1,0xffffffff,0,0},{x+fw,y,0,1,0xffffffff,1,0},{x,y+fh,0,1,0xffffffff,0,1},{x+fw,y+fh,0,1,0xffffffff,1,1}};
                if (SUCCEEDED(d->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP,2,v,sizeof(Vertex9)))) InterlockedExchange(&lastRendered,(LONG)frameVersion);
                state->Apply();state->Release();
            }
        }
        ReleaseSRWLockExclusive(&guard);
    }
    return originalEndScene(d);
}
static HRESULT WINAPI reset9(IDirect3DDevice9* d,D3DPRESENT_PARAMETERS* p) {
    AcquireSRWLockExclusive(&guard);if (device9==d) { drop(texture9);uploaded9=0; }ReleaseSRWLockExclusive(&guard);
    return originalReset(d,p);
}

// Direct3D 11: context-state swapping preserves the game's full graphics pipeline.
typedef HRESULT (WINAPI *PresentFn)(IDXGISwapChain*,UINT,UINT);
static PresentFn originalPresent=nullptr;
static ID3D11Device* device11=nullptr;
static ID3D11DeviceContext1* context11=nullptr;
static ID3DDeviceContextState* state11=nullptr;
static ID3D11VertexShader* vs11=nullptr;
static ID3D11PixelShader* ps11=nullptr;
static ID3D11Buffer* constants11=nullptr;
static ID3D11SamplerState* sampler11=nullptr;
static ID3D11BlendState* blend11=nullptr;
static ID3D11RasterizerState* raster11=nullptr;
static ID3D11DepthStencilState* depth11=nullptr;
static ID3D11Texture2D* texture11=nullptr;
static ID3D11ShaderResourceView* view11=nullptr;
static uint32_t texture11W=0,texture11H=0,uploaded11=0;
static void release11() {
    drop(view11);drop(texture11);drop(vs11);drop(ps11);drop(constants11);drop(sampler11);drop(blend11);drop(raster11);drop(depth11);drop(state11);drop(context11);drop(device11);uploaded11=0;
}
static bool prepare11(ID3D11Device* d) {
    if (d==device11) return context11 && state11 && vs11 && ps11 && constants11 && sampler11 && blend11 && raster11 && depth11;
    release11();device11=d;d->AddRef();
    ID3D11Device1* d1=nullptr;ID3D11DeviceContext* c=nullptr;
    d->GetImmediateContext(&c);if(c) { c->QueryInterface(__uuidof(ID3D11DeviceContext1),(void**)&context11);c->Release(); }
    if (FAILED(d->QueryInterface(__uuidof(ID3D11Device1),(void**)&d1))) return false;
    D3D_FEATURE_LEVEL level=d->GetFeatureLevel(),chosen;
    HRESULT hr=d1->CreateDeviceContextState(0,&level,1,D3D11_SDK_VERSION,__uuidof(ID3D11Device),&chosen,&state11);d1->Release();
    if (FAILED(hr) || !context11) return false;
    const char* code="cbuffer C:register(b0){float4 r;}struct O{float4 p:SV_POSITION;float2 t:TEXCOORD0;};O vs(uint id:SV_VertexID){float2 t=float2(id&1,id>>1);O o;o.p=float4(r.xy+t*r.zw,0,1);o.t=t;return o;}Texture2D tex:register(t0);SamplerState sam:register(s0);float4 ps(O o):SV_TARGET{return tex.Sample(sam,o.t);}";
    ID3DBlob *v=nullptr,*p=nullptr,*error=nullptr;
    hr=D3DCompile(code,strlen(code),nullptr,nullptr,nullptr,"vs","vs_4_0",0,0,&v,&error);drop(error);
    if (FAILED(hr)) return false;
    hr=D3DCompile(code,strlen(code),nullptr,nullptr,nullptr,"ps","ps_4_0",0,0,&p,&error);drop(error);
    if (FAILED(hr)) {drop(v);return false;}
    d->CreateVertexShader(v->GetBufferPointer(),v->GetBufferSize(),nullptr,&vs11);d->CreatePixelShader(p->GetBufferPointer(),p->GetBufferSize(),nullptr,&ps11);drop(v);drop(p);
    D3D11_BUFFER_DESC bd={};bd.ByteWidth=16;bd.Usage=D3D11_USAGE_DEFAULT;bd.BindFlags=D3D11_BIND_CONSTANT_BUFFER;d->CreateBuffer(&bd,nullptr,&constants11);
    D3D11_SAMPLER_DESC sd={};sd.Filter=D3D11_FILTER_MIN_MAG_MIP_POINT;sd.AddressU=sd.AddressV=sd.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sd.MaxLOD=D3D11_FLOAT32_MAX;d->CreateSamplerState(&sd,&sampler11);
    D3D11_BLEND_DESC bl={};bl.RenderTarget[0].BlendEnable=TRUE;bl.RenderTarget[0].SrcBlend=D3D11_BLEND_ONE;bl.RenderTarget[0].DestBlend=D3D11_BLEND_INV_SRC_ALPHA;bl.RenderTarget[0].BlendOp=D3D11_BLEND_OP_ADD;bl.RenderTarget[0].SrcBlendAlpha=D3D11_BLEND_ONE;bl.RenderTarget[0].DestBlendAlpha=D3D11_BLEND_INV_SRC_ALPHA;bl.RenderTarget[0].BlendOpAlpha=D3D11_BLEND_OP_ADD;bl.RenderTarget[0].RenderTargetWriteMask=D3D11_COLOR_WRITE_ENABLE_ALL;d->CreateBlendState(&bl,&blend11);
    D3D11_RASTERIZER_DESC rs={};rs.FillMode=D3D11_FILL_SOLID;rs.CullMode=D3D11_CULL_NONE;rs.DepthClipEnable=TRUE;d->CreateRasterizerState(&rs,&raster11);
    D3D11_DEPTH_STENCIL_DESC ds={};ds.DepthEnable=FALSE;ds.StencilEnable=FALSE;d->CreateDepthStencilState(&ds,&depth11);
    return vs11&&ps11&&constants11&&sampler11&&blend11&&raster11&&depth11;
}
static HRESULT WINAPI render11(IDXGISwapChain* swap,UINT interval,UINT presentFlags) {
    if (!peerConnected) return originalPresent(swap,interval,presentFlags);
    if (!(presentFlags&DXGI_PRESENT_TEST) && TryAcquireSRWLockExclusive(&guard)) {
        ID3D11Device* d=nullptr;
        if (SUCCEEDED(swap->GetDevice(__uuidof(ID3D11Device),(void**)&d))) {
            DXGI_SWAP_CHAIN_DESC desc={};swap->GetDesc(&desc);BOOL full=FALSE;swap->GetFullscreenState(&full,nullptr);
            ID3D11Texture2D* back=nullptr;D3D11_TEXTURE2D_DESC backDesc={};
            if (SUCCEEDED(swap->GetBuffer(0,__uuidof(ID3D11Texture2D),(void**)&back))) {
                back->GetDesc(&backDesc);bool target=recordCanvas(desc.OutputWindow,backDesc.Width,backDesc.Height,full!=FALSE,"d3d11");
                if (target && active() && prepare11(d)) {
                    if (!texture11 || texture11W!=fw || texture11H!=fh) {
                        drop(view11);drop(texture11);texture11W=fw;texture11H=fh;uploaded11=0;
                        D3D11_TEXTURE2D_DESC td={};td.Width=fw;td.Height=fh;td.MipLevels=td.ArraySize=1;td.Format=DXGI_FORMAT_B8G8R8A8_UNORM;td.SampleDesc.Count=1;td.Usage=D3D11_USAGE_DEFAULT;td.BindFlags=D3D11_BIND_SHADER_RESOURCE;
                        if(SUCCEEDED(d->CreateTexture2D(&td,nullptr,&texture11)))d->CreateShaderResourceView(texture11,nullptr,&view11);
                    }
                    if (view11) {
                        ID3DDeviceContextState* previous=nullptr;context11->SwapDeviceContextState(state11,&previous);
                        if (uploaded11!=frameVersion) { context11->UpdateSubresource(texture11,0,nullptr,pixels.data(),fw*4,0);uploaded11=frameVersion; }
                        ID3D11RenderTargetView* target=nullptr;d->CreateRenderTargetView(back,nullptr,&target);
                        if (target) {
                            float rect[4]={2.f*fx/backDesc.Width-1.f,1.f-2.f*fy/backDesc.Height,2.f*fw/backDesc.Width,-2.f*fh/backDesc.Height};
                            context11->UpdateSubresource(constants11,0,nullptr,rect,0,0);
                            context11->OMSetRenderTargets(1,&target,nullptr);context11->OMSetBlendState(blend11,nullptr,0xffffffff);context11->OMSetDepthStencilState(depth11,0);
                            D3D11_VIEWPORT vp={0,0,(float)backDesc.Width,(float)backDesc.Height,0,1};context11->RSSetViewports(1,&vp);context11->RSSetState(raster11);
                            context11->IASetInputLayout(nullptr);context11->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP);
                            context11->VSSetShader(vs11,nullptr,0);context11->VSSetConstantBuffers(0,1,&constants11);context11->PSSetShader(ps11,nullptr,0);context11->PSSetShaderResources(0,1,&view11);context11->PSSetSamplers(0,1,&sampler11);
                            context11->Draw(4,0);InterlockedExchange(&lastRendered,(LONG)frameVersion);
                            // Our reusable context state must not retain a backbuffer across ResizeBuffers.
                            context11->OMSetRenderTargets(0,nullptr,nullptr);target->Release();
                        }
                        context11->SwapDeviceContextState(previous,nullptr);drop(previous);
                    }
                }
                back->Release();
            }
            d->Release();
        }
        ReleaseSRWLockExclusive(&guard);
    }
    return originalPresent(swap,interval,presentFlags);
}

static bool hook9=false,hook11=false;
static void installHooks() {
    WNDCLASSW wc={};wc.lpfnWndProc=DefWindowProcW;wc.hInstance=ownModule;wc.lpszClassName=L"CEMBattleDeviceProbe";RegisterClassW(&wc);
    HWND h=CreateWindowW(wc.lpszClassName,L"",WS_POPUP,0,0,16,16,nullptr,nullptr,ownModule,nullptr);
    if (!h) return;
    if (!hook9 && GetModuleHandleW(L"d3d9.dll")) {
        IDirect3D9* d9=Direct3DCreate9(D3D_SDK_VERSION);IDirect3DDevice9* d=nullptr;
        D3DPRESENT_PARAMETERS p={};p.Windowed=TRUE;p.SwapEffect=D3DSWAPEFFECT_DISCARD;p.hDeviceWindow=h;p.BackBufferWidth=p.BackBufferHeight=16;
        HRESULT created=d9?d9->CreateDevice(D3DADAPTER_DEFAULT,D3DDEVTYPE_HAL,h,D3DCREATE_SOFTWARE_VERTEXPROCESSING,&p,&d):E_FAIL;
        // An existing exclusive D3D9 device can deny another hardware device.
        // NULLREF exposes the same runtime entry points without acquiring the display.
        if (FAILED(created) && d9) created=d9->CreateDevice(D3DADAPTER_DEFAULT,D3DDEVTYPE_NULLREF,h,D3DCREATE_SOFTWARE_VERTEXPROCESSING,&p,&d);
        if (SUCCEEDED(created) && d) {
            void** v=*(void***)d;
            if (MH_CreateHook(v[42],(void*)render9,(void**)&originalEndScene)==MH_OK && MH_CreateHook(v[16],(void*)reset9,(void**)&originalReset)==MH_OK) { MH_EnableHook(v[42]);MH_EnableHook(v[16]);hook9=true; }
            d->Release();
        }
        drop(d9);
    }
    if (!hook11 && GetModuleHandleW(L"d3d11.dll")) {
        DXGI_SWAP_CHAIN_DESC sd={};sd.BufferCount=1;sd.BufferDesc.Width=sd.BufferDesc.Height=16;sd.BufferDesc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;sd.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT;sd.OutputWindow=h;sd.SampleDesc.Count=1;sd.Windowed=TRUE;sd.SwapEffect=DXGI_SWAP_EFFECT_DISCARD;
        IDXGISwapChain* s=nullptr;ID3D11Device* d=nullptr;ID3D11DeviceContext* c=nullptr;
        if (SUCCEEDED(D3D11CreateDeviceAndSwapChain(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,0,nullptr,0,D3D11_SDK_VERSION,&sd,&s,&d,nullptr,&c))) {
            void** v=*(void***)s;
            if(MH_CreateHook(v[8],(void*)render11,(void**)&originalPresent)==MH_OK) { MH_EnableHook(v[8]);hook11=true; }
        }
        drop(c);drop(s);drop(d);
    }
    DestroyWindow(h);UnregisterClassW(wc.lpszClassName,ownModule);
}

#pragma pack(push,1)
struct Header { uint32_t magic,version,length,width,height;int32_t x,y;uint32_t flags,moveAck; };
#pragma pack(pop)
static const uint32_t MAGIC=0x314e4243; // CBN1
static bool readExact(HANDLE pipe,void* data,DWORD count) {
    uint8_t* p=(uint8_t*)data;
    while(count) { DWORD done=0;if(!ReadFile(pipe,p,count,&done,nullptr)||!done)return false;p+=done;count-=done; }
    return true;
}
static bool writeEvent(HANDLE pipe,const char* text) { DWORD done=0;DWORD n=(DWORD)strlen(text);return WriteFile(pipe,text,n,&done,nullptr)&&done==n; }
static DWORD WINAPI worker(void*) {
    InterlockedExchange(&workerStage,1);MH_Initialize();installHooks();InterlockedExchange(&workerStage,2);
    char pipeName[128];snprintf(pipeName,128,"\\\\.\\pipe\\CEM-BattleNotify-%lu-%s",GetCurrentProcessId(),BN_BUILD_ID);
    for(;;) {
        HANDLE pipe=CreateFileA(pipeName,GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,0,nullptr);
        if(pipe==INVALID_HANDLE_VALUE) { Sleep(500);continue; }
        char event[512];snprintf(event,sizeof(event),"{\"type\":\"hello\",\"version\":1,\"build\":\"%s\",\"pid\":%lu,\"hook9\":%s,\"hook11\":%s}\n",BN_BUILD_ID,GetCurrentProcessId(),hook9?"true":"false",hook11?"true":"false");
        if(!writeEvent(pipe,event)) {CloseHandle(pipe);continue;}
        InterlockedExchange(&workerStage,3);
        InterlockedExchange(&peerConnected,1);
        InterlockedExchange(&dirtyReady,1);LONG reported=0;
        bool connected=true;
        while(connected) {
            DWORD available=0;if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&available,nullptr))break;
            if(available>=sizeof(Header)) {
                Header h={};if(!readExact(pipe,&h,sizeof(h)))break;
                if(h.magic!=MAGIC || h.version!=1 || h.width>1024 || h.height>2048 || h.length!=h.width*h.height*4 || h.length>8388608 || h.flags>3)break;
                std::vector<uint8_t> data(h.length);if(h.length && !readExact(pipe,data.data(),h.length))break;
                AcquireSRWLockExclusive(&guard);
                if(h.moveAck>=moveSequence) {fx=h.x;fy=h.y;}
                fw=h.width;fh=h.height;flags=h.flags;pixels.swap(data);frameVersion++;lastFrameAt=GetTickCount();
                if(canvasW && canvasH)clampPosition();ReleaseSRWLockExclusive(&guard);
            }
            if(InterlockedExchange(&dirtyReady,0)) {
                AcquireSRWLockShared(&guard);POINT origin={0,0};if(gameWindow)ClientToScreen(gameWindow,&origin);
                snprintf(event,sizeof(event),"{\"type\":\"canvas\",\"api\":\"%s\",\"width\":%u,\"height\":%u,\"exclusive\":%s,\"left\":%ld,\"top\":%ld,\"clientWidth\":%u,\"clientHeight\":%u}\n",graphics,canvasW,canvasH,exclusive?"true":"false",origin.x,origin.y,clientW,clientH);ReleaseSRWLockShared(&guard);
                connected=writeEvent(pipe,event);
            }
            LONG rendered=InterlockedCompareExchange(&lastRendered,0,0);
            if(rendered && rendered!=reported) { reported=rendered;connected=writeEvent(pipe,"{\"type\":\"rendered\"}\n"); }
            if(InterlockedExchange(&dirtyMove,0)) {
                AcquireSRWLockShared(&guard);snprintf(event,sizeof(event),"{\"type\":\"move\",\"x\":%d,\"y\":%d,\"sequence\":%u}\n",fx,fy,moveSequence);ReleaseSRWLockShared(&guard);connected=writeEvent(pipe,event);
            }
            if(InterlockedExchange(&dirtyLock,0)) connected=writeEvent(pipe,"{\"type\":\"lock\"}\n");
            Sleep(8);
        }
        InterlockedExchange(&peerConnected,0);CloseHandle(pipe);AcquireSRWLockExclusive(&guard);flags=0;dragging=false;pressedLock=false;pixels.clear();fw=fh=0;moveSequence=0;ReleaseSRWLockExclusive(&guard);Sleep(100);
    }
}
BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID) {
    if(reason==DLL_PROCESS_ATTACH) {ownModule=instance;DisableThreadLibraryCalls(instance);HANDLE h=CreateThread(nullptr,0,worker,nullptr,0,nullptr);if(h)CloseHandle(h);}
    return TRUE;
}
