const defaults = {
  coastNoise: [610, 1900, 1.3, 0.45],
  coastFilter: [0.24, 0.72],
  sedimentBlend: [0.13, 0.74, 0.2],
  coverBlend: [0.36, 0.32, 0.42, 0.48],
  mineralBlend: [0.78, 0.31, 0.28, 0.5],
  grainLod: 6,
  shadowFootprint: 24,

  "polarNorth": [
    0.5,
    0.75
  ],
  "polarSouth": [
    0.5,
    0.25
  ],
  "polarScale": [
    0.2,
    0.4
  ],
  "polarRange": [
    0.9,
    0.97
  ],
  "referenceSize": [
    4096,
    2048
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
  "regionalColorMatch": 1,
  "regionalDetail": 1,
  "regionalSharpness": 0,
  "waterOrbitMix": 1,
  "realismStrength": 0,
  "waterEnabled": 0,
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
};
export function terrainSettings(profile) {
  const root = profile.grid?.find(tile => tile.depth === 0);
  const gridScale = root ? [1 / root.bounds[2], 1 / root.bounds[3]] : [1, 1];
  return {...defaults, gridScale, ...profile.render};
}
