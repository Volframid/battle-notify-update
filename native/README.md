# In-game notification renderer

Battle Notify includes prebuilt Windows x86 and x64 renderers. Toolbox downloads both automatically using the module manifest, then selects the architecture of its linked TERA client. Users do not install a compiler, another meter, Node package or separate overlay application. Windows 10/11 and graphical Toolbox with its client interface are required.

The renderer receives the module's transparent notification pixels over a local named pipe and draws them inside Direct3D 9 or 11. Only the explicit Move & preview header handles mouse input. Locked notifications forward input to the game. No gameplay memory is read or changed and no keys or clicks are generated. Closing the connection clears the image; the small loaded component stays inactive until TERA exits.

Every binary has a content-hashed filename and a SHA-256 entry in `renderer.json` and the Toolbox update manifest. The host checks the file again before loading it through Toolbox's linked-client API. A failed check leaves the component unloaded. New versions use new filenames and a separate build-specific pipe, avoiding replacement of a loaded DLL. Fully exit TERA and restart Toolbox after updates to activate the new version. Updates preserve `data/overlay.json` and existing notification rules.

## Maintainer build

Runtime users never perform these steps. Source is included for review and rebuilding.

1. Obtain the official [llvm-mingw 20260616 UCRT x86_64 archive](https://github.com/mstorsjo/llvm-mingw/releases/download/20260616/llvm-mingw-20260616-ucrt-x86_64.zip). Its SHA-256 is `b9b68a4d276e16fa25802aaba458e4638f64b3884c290aaccdc2d87083b6ca35`.
2. Extract it and run `python scripts/build-native.py --toolchain <extracted-directory>` with Python 3.
3. Keep the two DLLs referenced by `native/renderer.json` in the publication tree. Archive older build outputs outside it.
4. Run `node scripts/build-manifest.cjs`. It verifies the selected binaries' hashes and includes their metadata and notices. Publish the binaries, metadata, JavaScript and manifest together after validation.

The build statically links compiler support; system DirectX and Windows libraries remain system dependencies. MinHook 1.3.4 is vendored at commit `c3fcafdc10146beb5919319d0683e44e3c30d537`. See `licenses/` for MinHook, LLVM and MinGW runtime notices. No GOverlay binary or library is used.

Validate both architectures with actual DirectX 9/11 windowed and exclusive-fullscreen fixtures, graphics state restoration, device reset, transparent pixels, drag/lock and host disconnect. Controlled fixtures do not replace a live TERA test with the user's graphics configuration.
