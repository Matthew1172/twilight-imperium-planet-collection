import {makeRegionalGrid} from './region-grid.js';
const tile = name => 'planet-materials/' + name + '.jpg';
const native = name => 'dossier-worlds/materials-v9/' + name + '.jpg';

export const profiles = {
  nestphar: {
    label: 'Nestphar', polarCaps:false, polarShore:false,
    guide: 'planet-materials/nestphar-satellite-global-v1/orbit.webp',
    orbitalHalfSize:4096, orbitalHalves:['planet-materials/nestphar-satellite-global-v1/orbit-0.webp','planet-materials/nestphar-satellite-global-v1/orbit-1.webp'],
    gridGeology:'planet-materials/nestphar-geology-realism.png',
    grid: makeRegionalGrid(8,4,'planet-materials/nestphar-satellite-global-v1'),
    regions: [{label:'Lake and ridge',bounds:[.625,.5,.125,.25]},{label:'Crater lake',bounds:[.75,.5,.125,.25]}],
    render: {referenceSize:[16384,8192],polarNorth:[.5,.90],polarSouth:[.5,.10],polarScale:[.18,.13],polarRange:[.88,.965],coastNoise:[610,1900,.25,.10],coastFilter:[.55,1.2],waterEnabled:0,waterOrbitMix:0,realismStrength:0,closeRange:[10000,20000],regionalDetail:3,regionalSharpness:.25,regionalColorMatch:0,waterDeep:[.008,.026,.025],waterShallow:[.045,.09,.07],waterSky:[.06,.11,.1],waterGlint:[.1,.15,.12],waveAmplitude:.025,ridgePower:1.05,grainStrength:.72,cliffRange:[.003,.10],materialScales:[8,384,9,384],fetchDensity:.04,materialDensity:.18,requestLimit:2},
    minerals: {baseSurface:'planet-materials/nestphar-cliff-response-v2.png', coverSurface:'planet-materials/nestphar-canopy-realism-response.png', mineralColor:'planet-materials/nestphar-cliff-v2.jpg', sedimentColor:'planet-materials/green-terraces.jpg', mineralSurface:'planet-materials/nestphar-cliff-response-v2.png', sedimentSurface:'planet-materials/olive-sediment-relief.webp'},
    directCrust:true, cover:'planet-materials/nestphar-canopy-realism.jpg', substrate:'planet-materials/nestphar-cliff-v2.jpg', mappedRelief:.004, relief:.001
  },

  arcprime: {
    label: "Arc Prime",
    orbitalHalfSize: 8192,
    render: {
      coastNoise: [610, 1900, 1.3, 0.45],
      coastFilter: [0.24, 0.72],
      sedimentBlend: [0.13, 0.74, 0.2],
      coverBlend: [0.36, 0.32, 0.42, 0.48],
      mineralBlend: [0.78, 0.31, 0.28, 0.5],
      grainLod: 6,
      shadowFootprint: 24,

      "polarNorth": [
            0.43,
            0.75
      ],
      "polarSouth": [
            0.32,
            0.22
      ],
      "polarScale": [
            0.22,
            0.44
      ],
      "polarRange": [
            0.89,
            0.966
      ],
      "referenceSize": [
            8192,
            4096
      ],
      "colorFootprint": [
            512,
            256
      ],
      "shoreline": [
            128,
            3.65
      ],
      "inlandRange": [
            140,
            239
      ],
      "wetRange": [
            0.25,
            5
      ],
      "materialScales": [
            6.3,
            9.8,
            9,
            15
      ],
      "cliffRange": [
            0.012,
            0.21
      ],
      "closeRange": [
            0.42,
            1.5
      ],
      "wetTint": [
            0.71,
            0.77,
            0.81
      ],
      "paletteFloor": [
            0.045,
            0.039,
            0.031
      ],
      "ridgePower": 0.36,
      "grainStrength": 0.9,
      "waterEnabled": 1,
      "waterDeep": [
            0.003,
            0.009,
            0.015
      ],
      "waterShallow": [
            0.017,
            0.038,
            0.039
      ],
      "waterSky": [
            0.09,
            0.14,
            0.18
      ],
      "waterGlint": [
            0.14,
            0.17,
            0.18
      ],
      "shallowFalloff": 0.15,
      "waveFrequency": 290,
      "waveGrowth": 1.83,
      "waveAmplitude": 0.055,
      "waveSpeed": 1,
      "windDirection": [
            0.73,
            0.41,
            -0.55
      ],
      "lightOffset": [
            0.22,
            0.12
      ],
      "specularWidth": 0.0008,
      "reflectanceSettings": [
            0.025,
            0.65,
            5
      ],
      "fadeMs": 350,
      "fetchDensity": 0.17,
      "materialDensity": 0.23,
      "neighborRadius": 0.86,
      "requestLimit": 2,
      "projectionScale": 0.65
},
    orbitalHalves:['planet-materials/arcprime-orbit16-0.webp','planet-materials/arcprime-orbit16-1.webp'],
    gridGeology:"planet-materials/arcprime-grid-geology.png",
    grid:makeRegionalGrid(8,4,"planet-materials/arcprime-grid"),
    minerals: {baseSurface:'planet-materials/nestphar-cliff-response-v2.png',coverSurface:'planet-materials/bronze-ash-relief.webp',mineralColor:tile('ochre-crust'),sedimentColor:tile('olive-sediment'),
      mineralSurface:'planet-materials/ochre-crust-relief.webp',sedimentSurface:'planet-materials/olive-sediment-relief.webp'},
    regions: [
      {label:"Basalt bay",bounds:[5484/8192,1962/4096,.125,.25]},
      {label:"Mineral ridge",bounds:[.203125,.375,.125,.25]}
    ], polarCaps: true, directCrust: true, mappedRelief: .034, guide: "planet-materials/arcprime-wrap-8k.webp", cover: tile('bronze-ash'), substrate: tile('bedrock'), relief: .008 },
  wrenterra: { cover: tile('green-terraces'), substrate: tile('bedrock'), relief: .012 },
  lisisii: { cover: native('sand'), substrate: native('stone'), relief: .035 },
  ragh: { cover: native('stone'), substrate: native('ice'), relief: .045 }
};

export const uncachedAssets = new Set(Object.values(profiles).flatMap(p => [...(p.orbitalHalves || []), ...(p.grid || []).map(t => t.color)]));
