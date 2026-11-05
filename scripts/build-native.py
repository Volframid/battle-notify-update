from pathlib import Path
import subprocess,hashlib,json,argparse,tempfile
parser=argparse.ArgumentParser(description='Build both precompiled Battle Notify renderers (maintainers only)')
parser.add_argument('--toolchain',required=True,help='Extracted llvm-mingw-20260616-ucrt-x86_64 directory')
args=parser.parse_args();root=Path(__file__).resolve().parents[1];tools=Path(args.toolchain).resolve()/'bin'
work=Path(tempfile.mkdtemp(prefix='battle-native-build-'));(root/'native/bin').mkdir(exist_ok=True)
fingerprint=hashlib.sha256(Path(__file__).read_bytes())
for source in sorted([root/'native/src/bridge.cpp',*list((root/'native/vendor/minhook').rglob('*.c')),*list((root/'native/vendor/minhook').rglob('*.h'))]):
    fingerprint.update(source.relative_to(root).as_posix().encode());fingerprint.update(source.read_bytes())
build_id=fingerprint.hexdigest()[:16]
meta={'protocol':1,'buildId':build_id,'architectures':{}}
for arch,target,hde in [('x64','x86_64','hde64'),('ia32','i686','hde32')]:
    objects=[]
    for rel in ['buffer.c','hook.c','trampoline.c','hde/'+hde+'.c']:
        obj=work/(arch+'-'+Path(rel).stem+'.o');objects.append(str(obj))
        subprocess.run([str(tools/(target+'-w64-mingw32-clang.exe')),'-O2','-c',str(root/'native/vendor/minhook/src'/rel),'-I'+str(root/'native/vendor/minhook/include'),'-o',str(obj)],check=True)
    dll=work/('battle-render-'+arch+'.dll')
    subprocess.run([str(tools/(target+'-w64-mingw32-clang++.exe')),'-std=c++17','-DBN_BUILD_ID=\"'+build_id+'\"','-O2','-shared','-static','-Wl,--no-insert-timestamp','-I'+str(root/'native/vendor/minhook/include'),str(root/'native/src/bridge.cpp'),*objects,'-ld3d9','-ld3d11','-ldxgi','-ld3dcompiler_47','-luser32','-lgdi32','-o',str(dll)],check=True)
    digest=hashlib.sha256(dll.read_bytes()).hexdigest();name='battle-render-'+digest[:12]+'-'+arch+'.dll';(root/'native/bin'/name).write_bytes(dll.read_bytes());meta['architectures'][arch]={'file':'native/bin/'+name,'sha256':digest};print(arch,name,dll.stat().st_size)
(root/'native/renderer.json').write_text(json.dumps(meta,indent=2)+'\n')
