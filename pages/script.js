import '@google/model-viewer'
import { WebIO } from '@gltf-transform/core';
import { DracoMeshCompression } from '@gltf-transform/extensions';

// Global Draco decoder.
let decoderModule = {};
let dracoDecoderType = {};
let encoderModule = {};
let dracoEncoderType = {};

// It is recommended to always pull your Draco JavaScript and WASM decoders
// from this URL. Users will benefit from having the Draco decoder in cache
// as more sites start using the static URL.
let decoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.4.1/';
// TODO(vignatti): I've failed to find a service that currently is hosting the
// encoder stuff.
let encoderPath = './';

// This function loads a JavaScript file and adds it to the page. "path" is
// the path to the JavaScript file. "onLoadFunc" is the function to be called
// when the JavaScript file has been loaded.
function loadJavaScriptFile(path, onLoadFunc) {
  const head = document.getElementsByTagName('head')[0];
  const element = document.createElement('script');
  element.type = 'text/javascript';
  element.src = path;
  if (onLoadFunc !== null)
    element.onload = onLoadFunc;

  head.appendChild(element);
}

function loadWebAssemblyDecoder() {
  dracoDecoderType['wasmBinaryFile'] = 'draco_decoder.wasm';

  const xhr = new XMLHttpRequest();
  xhr.open('GET', decoderPath + 'draco_decoder.wasm', true);
  xhr.responseType = 'arraybuffer';

  xhr.onload = function() {
    // For WebAssembly the object passed into DracoModule() must contain a
    // property with the name of wasmBinary and the value must be an
    // ArrayBuffer containing the contents of the .wasm file.
    dracoDecoderType['wasmBinary'] = xhr.response;
    createDecoderModule();
  };

  xhr.send(null)
}

function loadWebAssemblyEncoder() {
  dracoEncoderType['wasmBinaryFile'] = 'draco_encoder.wasm';

  const xhr = new XMLHttpRequest();
  xhr.open('GET', encoderPath + 'draco_encoder.wasm', true);
  xhr.responseType = 'arraybuffer';

  xhr.onload = function() {
    // For WebAssembly the object passed into DracoModule() must contain a
    // property with the name of wasmBinary and the value must be an
    // ArrayBuffer containing the contents of the .wasm file.
    dracoEncoderType['wasmBinary'] = xhr.response;
    createEncoderModule();
  };

  xhr.send(null)
}

function createDecoderModule() {
  // draco_decoder.js or draco_wasm_wrapper.js must be loaded before
  // DracoModule is created.
  DracoDecoderModule({}).then((module) => {
    decoderModule = module;
    // console.log('DracoDecoderModule: true');
  });
}

function createEncoderModule() {
  DracoEncoderModule({}).then((module) => {
    encoderModule = module;
    // console.log('DracoEncoderModule: true');
  });
}

// This function will test if the browser has support for WebAssembly. If it
// does it will download the WebAssembly Draco decoder and encoder, if not it
// will download the asmjs version of them.
function loadDraco() {
  if (typeof WebAssembly !== 'object') {
    // No WebAssembly support. DracoModule must be called with no parameters
    // or an empty object to create a JavaScript decoder.
    loadJavaScriptFile(decoderPath + 'draco_decoder.js', createDecoderModule);
    loadJavaScriptFile(encoderPath + 'draco_encoder.js', createEncoderModule);
  } else {
    loadJavaScriptFile(decoderPath + 'draco_wasm_wrapper.js',
                       loadWebAssemblyDecoder);
    loadJavaScriptFile(encoderPath + 'draco_encoder_wrapper.js',
                       loadWebAssemblyEncoder);
  }
}

function saveFile(blob, filename) {
  if (window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
  } else {
    const a = document.createElement('a');
    document.body.appendChild(a);
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0)
  }
}

export default {
  data: () => ({
    hasModel: false,
    modelUrl: '',
    modelBlob: null,
  }),
  async mounted() {
    loadDraco();
  },
  methods: {
    async decodeStuff() {
      const io = new WebIO({credentials: 'include'})
        .registerExtensions([DracoMeshCompression])
        .registerDependencies({
          'draco3d.decoder': decoderModule,
          'draco3d.encoder': encoderModule,
        });

      // Read from disk
      const doc = await io.read('model-compressed.glb');  // → Document

      const extensionsUsed = doc.getRoot().listExtensionsUsed()
        .map((e) => e.extensionName)
        .sort();
      console.log(extensionsUsed);
    },
    handleSaveFile(blob, filename) {
      saveFile(this.modelBlob, 'saved-compressed.glb')
    },
    async encodeStuff() {
      const io = new WebIO({credentials: 'include'})
        .registerExtensions([DracoMeshCompression])
        .registerDependencies({
          'draco3d.decoder': decoderModule,
          'draco3d.encoder': encoderModule,
        });

      // Read from disk
      const doc = await io.read('model-not-compressed.glb');  // → Document
      doc.createExtension(DracoMeshCompression).setRequired(true);
      const extensionsUsed = doc.getRoot().listExtensionsUsed()
        .map((e) => e.extensionName)
        .sort();
      console.log(extensionsUsed);

      const arrayBuffer = io.writeBinary(doc);

      var binaryData = [];
      binaryData.push(arrayBuffer);
      this.modelBlob = new Blob(binaryData, {type: "model/gltf-binary"})
      this.modelUrl = URL.createObjectURL(this.modelBlob)

      this.hasModel = true;

      // Removes duplicate Accessor and Texture properties.
      // https://github.com/donmccurdy/glTF-Transform/blob/main/packages/lib/src/dedup.ts
      // await doc.transform(
      //  dedup({textures: true})
      // );
    },
  }
}
