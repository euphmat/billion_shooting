"use strict";
/* =========================================================
   store.js - IndexedDB セーブ基盤 (他の js より先に読み込む)

   軽量化の設計 (ここが肝):
   - 破壊ビットマップは約27MB ある。毎回まるごと書くのは論外なので
     8KB のチャンク (planet.js の CHUNK_BYTES) に切り、「このチャンクで
     何か壊した」フラグが立ったものだけを書き戻す
     (ふつうのプレイでは 1回の保存で数個 = 数十KB)
   - 書き込みは全部 async。ゲームループは完了を待たない
   - 値は構造化クローンでそのまま入れる (JSON.stringify しない)。
     Uint8Array / Int32Array はコピーだけで済むので文字列化より桁違いに速い
   - 小さいデータ (コイン・装備・スキル…) は 1レコードにまとめて丸ごと置換
   ========================================================= */
const DB_NAME = "billion_shooting", DB_VER = 2;
const ST_KV = "kv", ST_CH = "chunk";

const SaveDB = (() => {
  let db = null;

  function open(){
    return new Promise(res => {
      let rq;
      try { rq = indexedDB.open(DB_NAME, DB_VER); } catch(e){ return res(null); }
      rq.onupgradeneeded = ev => {
        const d = rq.result;
        if (!d.objectStoreNames.contains(ST_KV)) d.createObjectStore(ST_KV);
        // v1 はチャンクの刻みが違う。刻みを変えたので中身は使えない → 作り直す。
        // 惑星の破壊状況だけ消え、コイン・装備・スキル (kv:state) はそのまま残る
        if (ev.oldVersion < 2 && d.objectStoreNames.contains(ST_CH)){
          d.deleteObjectStore(ST_CH);
          try { rq.transaction.objectStore(ST_KV).delete("world"); } catch(e){}
        }
        if (!d.objectStoreNames.contains(ST_CH)) d.createObjectStore(ST_CH);
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = rq.onblocked = () => res(null);
    });
  }

  // 起動時に 1回だけ: 小データと破壊チャンクをまとめて読む
  async function loadAll(){
    const out = { state:null, world:null, chunks:[], ok:false };
    db = await open();
    if (!db) return out;                 // IndexedDB が使えない環境でも遊べるようにする
    out.ok = true;
    await new Promise(res => {
      let tx;
      try { tx = db.transaction([ST_KV, ST_CH], "readonly"); } catch(e){ return res(); }
      const kv = tx.objectStore(ST_KV), ch = tx.objectStore(ST_CH);
      kv.get("state").onsuccess = e => { out.state = e.target.result || null; };
      kv.get("world").onsuccess = e => { out.world = e.target.result || null; };
      ch.getAll().onsuccess   = e => { out.chunks = e.target.result || []; };
      tx.oncomplete = tx.onerror = tx.onabort = () => res();
    });
    return out;
  }

  // pairs: [[key, value], ...] — 1トランザクションでまとめて put する
  function put(store, pairs){
    if (!db || !pairs.length) return;
    try {
      const st = db.transaction(store, "readwrite").objectStore(store);
      for (const [k, v] of pairs) st.put(v, k);
    } catch(e){}
  }

  /* 惑星の破壊状況のように「まとめて書けないと辻褄が合わない」ものは、
     複数ストアを 1トランザクションで書く。途中で閉じても片方だけ残らない。
     groups: [[store, [[key, value], ...]], ...] */
  function putMulti(groups){
    if (!db) return;
    const names = groups.filter(g => g[1].length).map(g => g[0]);
    if (!names.length) return;
    try {
      const tx = db.transaction(names, "readwrite");
      for (const [store, pairs] of groups){
        if (!pairs.length) continue;
        const st = tx.objectStore(store);
        for (const [k, v] of pairs) st.put(v, k);
      }
    } catch(e){}
  }

  function clearAll(){
    return new Promise(res => {
      try { if (db) db.close(); } catch(e){}
      db = null;
      let rq;
      try { rq = indexedDB.deleteDatabase(DB_NAME); } catch(e){ return res(); }
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  }

  /* セーブを読み終えてから、残りのゲーム本体を読み込む。
     async=false を付けた動的 script は「並列ダウンロード・記述順に実行」になるので、
     元の <script> 並びと同じ順番が保たれ、かつ読み込みは遅くならない */
  function boot(srcs){
    return loadAll().then(d => {
      window.SAVED = d;
      const frag = document.createDocumentFragment();
      for (const s of srcs){
        const el = document.createElement("script");
        el.src = s; el.async = false;
        frag.appendChild(el);
      }
      document.body.appendChild(frag);
    });
  }

  return { loadAll, put, putMulti, clearAll, boot, get live(){ return !!db; } };
})();
