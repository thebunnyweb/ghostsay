'use strict';
// Each preset is a factory (ctx) => ({ duration, frame(canvas, t, final) }).
const scene = (name) => require('./scenes/' + name);
const PRESETS = {
  ghost: { create: require('./ghost').ghost, desc: 'a friendly 3D ghost floats up and says it (default)' },
  matrix: { create: require('./matrix').matrix, desc: 'digital rain; a 3D key made of code unlocks your message' },
  fire: { create: require('./fire').fire, desc: 'a 3D campfire at night, your message in burning letters' },
  party: { create: require('./party').party, desc: 'a spinning mirror ball, confetti cannons, fireworks' },
  ufo: { create: require('./ufo').ufo, desc: 'a flying saucer beams your message down, then takes it back' },
  city: { create: scene('city'), desc: 'a city at night: twinkling skyline, traffic, a neon sign' },
  garden: { create: scene('garden'), desc: 'a sunny garden: flowers in the breeze, butterflies, a picket fence' },
  beach: { create: scene('beach'), desc: 'sunset on the beach; a plane tows your message past the palms' },
  mountains: { create: scene('mountains'), desc: 'sunrise over misty mountain ranges' },
  snow: { create: scene('snow'), desc: 'a snowy night: northern lights, pines, a cabin with a warm window' },
  dubai: { create: scene('dubai'), desc: 'golden hour: Burj Khalifa, the sail hotel, a camel caravan' },
  newyork: { create: scene('newyork'), desc: 'Manhattan across the river: Empire State, Chrysler, Liberty' },
  mumbai: { create: scene('mumbai'), desc: 'Marine Drive at night: the Queen\'s Necklace, the Sea Link, rain' },
  bengaluru: { create: scene('bengaluru'), desc: 'the garden city at dusk: rain trees, tech parks, honking traffic' },
  brazil: { create: scene('brazil'), desc: 'Rio: Sugarloaf, Christ the Redeemer, Copacabana' },
  sanfran: { create: scene('sanfran'), desc: 'the Golden Gate Bridge with the fog rolling in' },
};
// other names people might type
const ALIASES = {
  beaches: 'beach', mountain: 'mountains', winter: 'snow', nyc: 'newyork', ny: 'newyork', bombay: 'mumbai',
  bangalore: 'bengaluru', blr: 'bengaluru', rio: 'brazil', sf: 'sanfran', sanfrancisco: 'sanfran', flowers: 'garden',
};
const resolve = (name) => { const k = String(name || '').toLowerCase().replace(/[\s_-]/g, ''); return PRESETS[k] ? k : ALIASES[k] || null; };
module.exports = { PRESETS, ALIASES, resolve };
