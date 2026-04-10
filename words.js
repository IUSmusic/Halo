const WORDS = [
  "hello","world","halo","keyboard","virtual","camera","press","gesture","surface","plane","space","backspace","enter","single","double","bed","mode","pointer","voice","type","typing","typed","calibration","mirror","overlay","mobile","phone","tablet","browser","install","predict","suggest","suggestion","touch","light","bright","dark","screen","cursor","navigate","scroll","click","home","shift","caps","symbol","numbers","arrow","left","right","up","down","today","tomorrow","good","great","quick","faster","stable","accuracy","hybrid","gesture","world","words","common","system","camera","permission","blocked","grant","again","start","stop","reset","place","placement","pin","pinned","rotate","rotation","anchor","anchored","profile","performance","device","smooth","smoothing","filter","kalman","confidence","tracking","tracked","track","finger","fingertip","thumb","index","middle","ring","pinky","hand","hands","flat","relaxed","lying","comfortable","comfort","sleep","message","text","email","name","number","symbol","comma","period","question","please","thanks","thank","browser","chrome","safari","android","ios","pages","project","launch","build","module","split","clean","error","fallback","toast","saved","save","local","storage","reload","persistent","continuous","speech","recognition","undo","commit","correction","command","commands","open","close","toggle","voice","input","output","display","guide","tour","first","load","welcome","neon","glow","hover","feedback","trail","trails","better","best","high","priority","lowest","latest","version","update","upgrade","improve","dramatically","fewer","missed","false","trigger","environment","rear","front","selfie","natural","raw","calibrate","captured","capture","baseline","depth","velocity","acceleration","hover","minimum","release","recovery","scale","larger","smaller","gentle","surface","snap","wrist","angle","tilt","side","single","side","sidebar","bottom","left","right","small","medium","large","exact","request","killer","user","experience","reliable","reliability","bulletproof","offline","worker","manifest","installable","progress","typing","phrase","sentence","paragraph","browser","window","history","forward","back","voice","activate","pointer","coarse","fine","real","world","augmented","reality","experimental","available","unsupported","unavailable","permission","allow","denied"
];

function buildTrie(words) {
  const root = { children: new Map(), words: [] };
  for (const word of words) {
    let node = root;
    for (const char of word) {
      if (!node.children.has(char)) node.children.set(char, { children: new Map(), words: [] });
      node = node.children.get(char);
      if (node.words.length < 8 && !node.words.includes(word)) node.words.push(word);
    }
  }
  return root;
}

const trie = buildTrie(WORDS);

export function getSuggestions(prefix) {
  const normalized = String(prefix || "").toLowerCase().trim();
  if (!normalized) return ["hello", "halo", "keyboard"];
  let node = trie;
  for (const char of normalized) {
    node = node.children.get(char);
    if (!node) return [];
  }
  return node.words.filter((word) => word !== normalized).slice(0, 4);
}
