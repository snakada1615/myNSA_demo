import React, { useState, useMemo, useEffect, useCallback } from "react";

const DATA_URL = `${import.meta.env.BASE_URL}data/tech_items.json`;
const SAVED_KEY = "nsaTechNavi.savedIds.v1";

const FS = {
  A: { label: "Availability", ja: "量的十分性", desc: "供給量とバランスは適正か", color: "#A6790A", tint: "#F3E9D2" },
  B: { label: "Accessibility", ja: "アクセス", desc: "脆弱な階層でもアクセスできる状態か", color: "#2F6690", tint: "#DCE7EE" },
  C: { label: "Stability", ja: "安定性", desc: "年間を通じ安定した量・価格で供給でき、外的ショックへの強靭性があるか", color: "#3F6B4A", tint: "#DEE7DF" },
  D: { label: "Utilization", ja: "利用", desc: "安全で質の良い食材を、栄養価を保って届けられるか", color: "#8C3A2B", tint: "#EBDBD6" },
};
const FS_ORDER = ["A", "B", "C", "D"];

const CATEGORIES = [
  { key: "主食", desc: "穀物・いも類など、エネルギー供給の中心となる作物", common: [] },
  { key: "野菜・果実", desc: "微量栄養素・食物繊維を補う園芸作物", common: [] },
  { key: "畜産（乳牛）", desc: "搾乳・乳製品を目的とした酪農", common: ["畜産（共通）"] },
  { key: "畜産（肉牛）", desc: "肥育・食肉を目的とした牛の飼養", common: ["畜産（共通）"] },
  { key: "畜産（ヤギ・羊）", desc: "小型反すう動物。小資本での資産形成にも活用される", common: ["畜産（共通）"] },
  { key: "畜産（豚）", desc: "食肉を目的とした養豚", common: ["畜産（共通）"] },
  { key: "畜産（養鶏）", desc: "卵・食肉を目的とした鶏の飼養", common: ["畜産（共通）"] },
  { key: "水産（養殖）", desc: "池・生簀等における計画的な養殖生産", common: ["水産（共通）"] },
  { key: "水産（漁獲）", desc: "天然水域からの漁獲と資源管理", common: ["水産（共通）"] },
];
const ALWAYS_COMMON = ["分野横断：制度・基盤", "分野横断：技術"];

const TECH_ORD = { 低: 1, 中: 2, 高: 3 };
const INVEST_ORD = { 小: 1, "小〜中": 2, 中: 3, "中〜大": 4, 大: 5 };
const POLICY_ORD = { 不要: 1, 一部必要: 2, 必須: 3 };

const BUDGET_OPTIONS = [
  { value: 1, label: "小規模", detail: "世帯・個人単位で用意できる範囲（資機材費など数千円〜数万円程度）" },
  { value: 3, label: "中規模", detail: "コミュニティ・グループ単位（研修・小規模施設整備など数十万円程度）" },
  { value: 5, label: "大規模", detail: "インフラ整備等、公共・ドナー予算規模の投資が見込める" },
];
const POLICY_OPTIONS = [
  { value: 1, label: "未整備", detail: "関連する制度・規制は整備されていない、または見通しが立っていない" },
  { value: 2, label: "一部整備", detail: "検討中、または部分的に整備されている" },
  { value: 3, label: "整備済み", detail: "必要な制度・規制はすでに整備されている" },
];
const TECH_OPTIONS = [
  { value: 1, label: "基礎対応", detail: "普及員による基礎的な技術指導で対応できる" },
  { value: 2, label: "研修で対応", detail: "専門研修を受ければ対応できる" },
  { value: 3, label: "専門人材あり", detail: "専門家・高度技術者を確保できる" },
];

const TIER_META = {
  must: { label: "必須", note: "現時点の条件でおおむね導入可能", color: "#22492E", tint: "#E1EADF" },
  should: { label: "望ましい", note: "一部条件を整えれば導入余地あり", color: "#8A5A12", tint: "#F1E4C9" },
  low: { label: "優先度低", note: "条件面のギャップが大きく、当面は中長期の検討課題", color: "#726C5E", tint: "#E7E4D7" },
};

function gapScore(reqOrd, capOrd, softMax) {
  const diff = reqOrd - capOrd;
  if (diff <= 0) return 0;
  if (diff <= softMax) return 0.5;
  return 1;
}

function classify(item, answers) {
  const techGap = gapScore(TECH_ORD[item.tl], answers.tech, 1);
  const investGap = gapScore(INVEST_ORD[item.il], answers.budget, 2);
  const policyGap = gapScore(POLICY_ORD[item.pl], answers.policy, 1);
  const hardBlock = item.pl === "必須" && answers.policy === 1;
  const total = techGap + investGap + policyGap;

  let tier;
  if (hardBlock) tier = "low";
  else if (total === 0) tier = "must";
  else if (total <= 1) tier = "should";
  else tier = "low";

  const gaps = [];
  if (techGap > 0) gaps.push("技術力");
  if (investGap > 0) gaps.push("予算");
  if (policyGap > 0) gaps.push("制度");

  return { tier, gaps };
}

function loadSavedIds() {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function persistSavedIds(ids) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch (e) {
    /* localStorageが使えない環境では無視する */
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch (e) {
    return iso;
  }
}

function StepDots({ step }) {
  const labels = ["品目", "課題", "現場条件", "結果"];
  return (
    <div className="steps">
      {labels.map((l, i) => {
        const n = i + 1;
        const state = n === step ? "current" : n < step ? "done" : "todo";
        return (
          <div className={"step-dot " + state} key={l}>
            <span className="dot-num">{n}</span>
            <span className="dot-label">{l}</span>
          </div>
        );
      })}
    </div>
  );
}

function ItemCard({ item, isCommon, open, onToggleOpen, saved, onToggleSaved }) {
  return (
    <div className="item-row" style={{ "--fs-color": FS[item.el] ? FS[item.el].color : "#999" }}>
      <div className="item-top" onClick={onToggleOpen}>
        <span className="item-title">{item.t}</span>
        {isCommon && <span className="item-tag">共通：{item.cat}</span>}
      </div>
      {item.gaps && item.gaps.length > 0 && (
        <div className="item-gaps">ギャップ：{item.gaps.join("・")}</div>
      )}
      {item.n && <div className="item-note">留意事項：{item.n}</div>}
      <div className="item-actions">
        <button className="item-toggle" onClick={onToggleOpen}>
          {open ? "詳細解説を閉じる" : "詳細解説を見る"}
        </button>
        <button
          className={"save-toggle" + (saved ? " saved" : "")}
          onClick={onToggleSaved}
        >
          {saved ? "候補リストから外す" : "候補リストに追加"}
        </button>
      </div>
      {open && (
        <div className="item-detail">
          {item.overview && (
            <div className="detail-block">
              <div className="detail-heading">技術概要</div>
              <p>{item.overview}</p>
            </div>
          )}
          {item.effects && (
            <div className="detail-block">
              <div className="detail-heading">期待される効果（4要素対応）</div>
              <p>{item.effects}</p>
            </div>
          )}
          <div className="detail-block">
            <div className="detail-heading">導入にあたっての前提条件</div>
            <div><b>a. 技術要素（{item.tl}）</b>：{item.td}</div>
            <div><b>b. 投資要素（{item.il}）</b>：{item.idt}</div>
            <div><b>c. 政策要素（{item.pl}）</b>：{item.pd}</div>
          </div>
          {item.sources && item.sources.length > 0 && (
            <div className="detail-block">
              <div className="detail-heading">出典・参考リンク</div>
              <ul className="source-list">
                {item.sources.map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                    ) : (
                      s.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionBlock({ title, options, value, onChange }) {
  return (
    <div className="qblock">
      <h2>{title}</h2>
      <div className="qoptions">
        {options.map((o) => (
          <button
            key={o.value}
            className={"qoption" + (value === o.value ? " selected" : "")}
            onClick={() => onChange(o.value)}
          >
            <span className="qoption-label">{o.label}</span>
            <span className="qoption-detail">{o.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [mode, setMode] = useState("wizard"); // wizard | search | saved

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState(null);
  const [elements, setElements] = useState([]);
  const [answers, setAnswers] = useState({ budget: null, policy: null, tech: null });
  const [openIds, setOpenIds] = useState({});

  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState(() => loadSavedIds());

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setItems(null);
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setMeta({ generatedAt: data.generatedAt, itemCount: data.itemCount });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || "読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    persistSavedIds(savedIds);
  }, [savedIds]);

  const toggleSaved = useCallback((id) => {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const activeCats = category ? [category.key, ...category.common, ...ALWAYS_COMMON] : [];

  const filtered = useMemo(() => {
    if (!items || !category || elements.length === 0) return [];
    return items.filter((it) => activeCats.includes(it.cat) && elements.includes(it.el));
  }, [items, category, elements]);

  const results = useMemo(() => {
    if (answers.budget === null || answers.policy === null || answers.tech === null) return null;
    const groups = { must: [], should: [], low: [] };
    filtered.forEach((it) => {
      const { tier, gaps } = classify(it, answers);
      groups[tier].push({ ...it, gaps });
    });
    return groups;
  }, [filtered, answers]);

  const searchResults = useMemo(() => {
    if (!items) return [];
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    return items.filter(
      (it) => it.t.toLowerCase().includes(lower) || (it.overview || "").toLowerCase().includes(lower)
    );
  }, [items, query]);

  const savedItems = useMemo(() => {
    if (!items) return [];
    const order = new Map(savedIds.map((id, i) => [id, i]));
    return items.filter((it) => order.has(it.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  }, [items, savedIds]);

  function toggleElement(key) {
    setElements((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function reset() {
    setStep(1);
    setCategory(null);
    setElements([]);
    setAnswers({ budget: null, policy: null, tech: null });
    setOpenIds({});
  }

  function toggleOpen(id) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function copySavedList() {
    const text = savedItems
      .map((it, i) => `${i + 1}. [${it.cat}] ${it.t}`)
      .join("\n");
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  const updatedLabel = meta && meta.generatedAt ? formatDate(meta.generatedAt) : null;

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <header className="header">
        <div className="eyebrow-row">
          <span className="app-title">NSA技術ナビ</span>
          <span className="app-sub">農業技術マッピング・現場向け絞り込みツール</span>
          {updatedLabel && <span className="data-updated">データ更新日：{updatedLabel}</span>}
        </div>
        <nav className="mode-nav">
          <button
            className={"mode-tab" + (mode === "wizard" ? " active" : "")}
            onClick={() => setMode("wizard")}
          >
            絞り込みで探す
          </button>
          <button
            className={"mode-tab" + (mode === "search" ? " active" : "")}
            onClick={() => setMode("search")}
          >
            キーワードで探す
          </button>
          <button
            className={"mode-tab" + (mode === "saved" ? " active" : "")}
            onClick={() => setMode("saved")}
          >
            候補リスト（{savedIds.length}）
          </button>
        </nav>
        {mode === "wizard" && <StepDots step={step} />}
      </header>

      <main className="panel">
        {loadError && (
          <section className="state-panel">
            <h1>データの読み込みに失敗しました</h1>
            <p className="lead">{loadError}</p>
            <button className="btn-primary" onClick={() => setReloadToken((t) => t + 1)}>
              再読み込み
            </button>
          </section>
        )}

        {!loadError && !items && (
          <section className="state-panel">
            <p className="lead">データを読み込んでいます…</p>
          </section>
        )}

        {!loadError && items && mode === "wizard" && (
          <>
            {step === 1 && (
              <section>
                <h1>対象の品目・分野を選んでください</h1>
                <p className="lead">現場で検討したい生産分野を1つ選びます。関連する共通技術（分野横断の制度・技術、および該当する畜産・水産の共通項目）は自動的に含まれます。</p>
                <div className="cat-list">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      className={"cat-row" + (category && category.key === c.key ? " selected" : "")}
                      onClick={() => setCategory(c)}
                    >
                      <span className="cat-name">{c.key}</span>
                      <span className="cat-desc">{c.desc}</span>
                      {c.common.length > 0 && (
                        <span className="cat-common">+ {c.common.join("・")}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="nav-row">
                  <span />
                  <button className="btn-primary" disabled={!category} onClick={() => setStep(2)}>
                    次へ
                  </button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section>
                <h1>直面している課題を選んでください</h1>
                <p className="lead">食料安全保障の4要素のうち、現場で優先したい課題を選びます（複数選択可）。</p>
                <div className="fs-grid">
                  {FS_ORDER.map((k) => {
                    const f = FS[k];
                    const active = elements.includes(k);
                    return (
                      <button
                        key={k}
                        className={"fs-card" + (active ? " selected" : "")}
                        style={{ "--fs-color": f.color, "--fs-tint": f.tint }}
                        onClick={() => toggleElement(k)}
                      >
                        <span className="fs-label">{f.label}</span>
                        <span className="fs-ja">{f.ja}</span>
                        <span className="fs-desc">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="nav-row">
                  <button className="btn-ghost" onClick={() => setStep(1)}>戻る</button>
                  <button className="btn-primary" disabled={elements.length === 0} onClick={() => setStep(3)}>
                    次へ（該当 {filtered.length} 件）
                  </button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section>
                <h1>現場の条件を教えてください</h1>
                <p className="lead">正確なスコアリングには対象地域固有のデータが必要ですが、ここでは一般的な目安として3点をお聞きし、技術ごとの前提条件（a〜d基準）と照らし合わせます。</p>

                <QuestionBlock title="① 想定できる投資規模は？" options={BUDGET_OPTIONS} value={answers.budget}
                  onChange={(v) => setAnswers((p) => ({ ...p, budget: v }))} />
                <QuestionBlock title="② 関連する政策・制度の整備状況は？" options={POLICY_OPTIONS} value={answers.policy}
                  onChange={(v) => setAnswers((p) => ({ ...p, policy: v }))} />
                <QuestionBlock title="③ 現場（普及員・農家）の技術対応力は？" options={TECH_OPTIONS} value={answers.tech}
                  onChange={(v) => setAnswers((p) => ({ ...p, tech: v }))} />

                <div className="nav-row">
                  <button className="btn-ghost" onClick={() => setStep(2)}>戻る</button>
                  <button
                    className="btn-primary"
                    disabled={answers.budget === null || answers.policy === null || answers.tech === null}
                    onClick={() => setStep(4)}
                  >
                    結果を見る
                  </button>
                </div>
              </section>
            )}

            {step === 4 && results && (
              <section>
                <h1>{category.key}｜絞り込み結果</h1>
                <p className="lead">
                  選択課題：{elements.map((k) => FS[k].ja).join("・")}／該当 {filtered.length} 件。
                  下記は投資規模・政策環境・技術対応力の3条件と、各技術の前提条件（a〜d基準）を機械的に照合した一次スクリーニングです。対象地域の実情確認を経たうえでの最終判断が必要です。
                </p>

                <div className="tier-summary">
                  {["must", "should", "low"].map((t) => (
                    <div className="tier-chip" key={t} style={{ "--tier-color": TIER_META[t].color, "--tier-tint": TIER_META[t].tint }}>
                      <span className="tier-chip-label">{TIER_META[t].label}</span>
                      <span className="tier-chip-count">{results[t].length}</span>
                    </div>
                  ))}
                </div>

                {["must", "should", "low"].map((t) => (
                  <div className="tier-group" key={t}>
                    <div className="tier-heading" style={{ "--tier-color": TIER_META[t].color }}>
                      <span className="tier-heading-label">{TIER_META[t].label}</span>
                      <span className="tier-heading-note">{TIER_META[t].note}</span>
                    </div>
                    {results[t].length === 0 && <p className="empty-note">該当項目はありません。</p>}
                    {results[t].map((it) => (
                      <ItemCard
                        key={it.id}
                        item={it}
                        isCommon={it.cat !== category.key}
                        open={!!openIds[it.id]}
                        onToggleOpen={() => toggleOpen(it.id)}
                        saved={savedIds.includes(it.id)}
                        onToggleSaved={() => toggleSaved(it.id)}
                      />
                    ))}
                  </div>
                ))}

                <div className="nav-row">
                  <button className="btn-ghost" onClick={() => setStep(3)}>条件を変更する</button>
                  <button className="btn-ghost" onClick={reset}>最初からやり直す</button>
                </div>
              </section>
            )}
          </>
        )}

        {!loadError && items && mode === "search" && (
          <section>
            <h1>キーワードで技術を探す</h1>
            <p className="lead">技術名・概要に含まれる語句で199項目全体からフリーワード検索します。すでに気になっている技術がある場合にお使いください。</p>
            <input
              className="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例：灌漑、コールドチェーン、バイオフォーティフィケーション"
            />
            {query.trim() === "" && <p className="empty-note">キーワードを入力してください。</p>}
            {query.trim() !== "" && (
              <>
                <p className="lead">該当 {searchResults.length} 件</p>
                {searchResults.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    isCommon={false}
                    open={!!openIds[it.id]}
                    onToggleOpen={() => toggleOpen(it.id)}
                    saved={savedIds.includes(it.id)}
                    onToggleSaved={() => toggleSaved(it.id)}
                  />
                ))}
              </>
            )}
          </section>
        )}

        {!loadError && items && mode === "saved" && (
          <section>
            <h1>候補リスト</h1>
            <p className="lead">
              「候補リストに追加」した技術がここに一覧表示されます。複数回の絞り込み・検索をまたいで蓄積でき、プロジェクトのパッケージ検討にお使いいただけます。
            </p>
            {savedItems.length === 0 && <p className="empty-note">候補に追加された項目はまだありません。</p>}
            {savedItems.length > 0 && (
              <>
                <div className="nav-row saved-actions">
                  <button className="btn-ghost" onClick={copySavedList}>一覧をコピー</button>
                  <button className="btn-ghost" onClick={() => window.print()}>印刷する</button>
                  <button className="btn-ghost" onClick={() => setSavedIds([])}>候補リストを空にする</button>
                </div>
                {savedItems.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    isCommon={false}
                    open={!!openIds[it.id]}
                    onToggleOpen={() => toggleOpen(it.id)}
                    saved={true}
                    onToggleSaved={() => toggleSaved(it.id)}
                  />
                ))}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');

.wrap {
  --paper: #F3F1E7;
  --ink: #262420;
  --muted: #6B6656;
  --line: #D9D4C3;
  font-family: 'Zen Kaku Gothic New', sans-serif;
  color: var(--ink);
  background: var(--paper);
  min-height: 100%;
  padding: 28px 20px 60px;
  box-sizing: border-box;
}
.wrap * { box-sizing: border-box; }

.header { max-width: 720px; margin: 0 auto 28px; }
.eyebrow-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.app-title { font-family: 'Shippori Mincho', serif; font-weight: 700; font-size: 22px; letter-spacing: 0.02em; }
.app-sub { font-size: 12.5px; color: var(--muted); }
.data-updated { font-size: 11px; color: var(--muted); margin-left: auto; border: 1px solid var(--line); padding: 2px 8px; border-radius: 3px; }

.mode-nav { display: flex; gap: 0; border: 1px solid var(--line); margin-bottom: 14px; }
.mode-tab {
  flex: 1; font-family: inherit; font-size: 12.5px; font-weight: 700; padding: 9px 8px;
  background: none; border: none; border-right: 1px solid var(--line); color: var(--muted); cursor: pointer;
}
.mode-tab:last-child { border-right: none; }
.mode-tab.active { background: var(--ink); color: var(--paper); }

.steps { display: flex; gap: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.step-dot { flex: 1; padding: 10px 4px; text-align: center; border-right: 1px solid var(--line); }
.step-dot:last-child { border-right: none; }
.dot-num { display: inline-block; width: 18px; height: 18px; line-height: 18px; border-radius: 50%; font-size: 11px; margin-right: 6px; background: var(--line); color: var(--muted); }
.step-dot.current .dot-num { background: var(--ink); color: var(--paper); }
.step-dot.done .dot-num { background: #3F6B4A; color: #fff; }
.dot-label { font-size: 12.5px; color: var(--muted); }
.step-dot.current .dot-label { color: var(--ink); font-weight: 700; }

.panel { max-width: 720px; margin: 0 auto; }
.state-panel { padding: 40px 4px; text-align: center; }
h1 { font-family: 'Shippori Mincho', serif; font-size: 21px; font-weight: 700; margin: 0 0 8px; }
h2 { font-size: 14.5px; font-weight: 700; margin: 26px 0 10px; }
.lead { font-size: 13.5px; color: var(--muted); line-height: 1.75; margin: 0 0 22px; max-width: 62ch; }

.cat-list { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.cat-row {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  text-align: left; background: none; border: none; border-bottom: 1px solid var(--line);
  padding: 14px 10px; cursor: pointer; font-family: inherit;
  border-left: 3px solid transparent;
}
.cat-row:hover { background: rgba(0,0,0,0.02); }
.cat-row.selected { border-left: 3px solid var(--ink); background: rgba(38,36,32,0.05); }
.cat-name { font-weight: 700; font-size: 14.5px; min-width: 140px; }
.cat-desc { font-size: 12.5px; color: var(--muted); flex: 1; }
.cat-common { font-size: 11px; color: var(--muted); border: 1px solid var(--line); padding: 2px 6px; border-radius: 3px; }

.fs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fs-card {
  text-align: left; padding: 16px 14px; border: 1px solid var(--line); background: #fff;
  cursor: pointer; font-family: inherit; border-left: 4px solid var(--line);
  display: flex; flex-direction: column; gap: 4px;
}
.fs-card.selected { border-left-color: var(--fs-color); background: var(--fs-tint); }
.fs-label { font-size: 11px; letter-spacing: 0.03em; color: var(--fs-color); font-weight: 700; }
.fs-ja { font-size: 15px; font-weight: 700; }
.fs-desc { font-size: 12px; color: var(--muted); line-height: 1.6; }

.qblock { border-top: 1px solid var(--line); padding-top: 4px; }
.qoptions { display: flex; flex-direction: column; gap: 8px; }
.qoption {
  text-align: left; padding: 11px 13px; border: 1px solid var(--line); background: #fff;
  cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 2px;
}
.qoption.selected { border-color: var(--ink); background: rgba(38,36,32,0.05); }
.qoption-label { font-size: 13px; font-weight: 700; }
.qoption-detail { font-size: 12px; color: var(--muted); }

.search-input {
  width: 100%; font-family: inherit; font-size: 14px; padding: 11px 13px;
  border: 1px solid var(--line); background: #fff; margin-bottom: 18px;
}

.nav-row { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--line); flex-wrap: wrap; gap: 8px; }
.saved-actions { justify-content: flex-start; margin-top: 0; padding-top: 0; border-top: none; margin-bottom: 20px; }
.btn-primary, .btn-ghost {
  font-family: inherit; font-size: 13px; font-weight: 700; padding: 10px 18px; cursor: pointer;
}
.btn-primary { background: var(--ink); color: var(--paper); border: 1px solid var(--ink); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-ghost { background: none; border: 1px solid var(--line); color: var(--ink); }

.tier-summary { display: flex; gap: 8px; margin-bottom: 26px; }
.tier-chip { border: 1px solid var(--line); border-left: 4px solid var(--tier-color); padding: 8px 12px; display: flex; gap: 8px; align-items: baseline; background: var(--tier-tint); }
.tier-chip-label { font-size: 12px; font-weight: 700; }
.tier-chip-count { font-size: 15px; font-weight: 700; }

.tier-group { margin-bottom: 26px; }
.tier-heading { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid var(--tier-color); padding-bottom: 6px; margin-bottom: 10px; }
.tier-heading-label { font-size: 15px; font-weight: 700; color: var(--tier-color); }
.tier-heading-note { font-size: 12px; color: var(--muted); }
.empty-note { font-size: 12.5px; color: var(--muted); padding: 6px 0; }

.item-row { border-bottom: 1px solid var(--line); padding: 12px 4px 14px 12px; border-left: 3px solid var(--fs-color); }
.item-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; cursor: pointer; }
.item-title { font-size: 13.5px; font-weight: 700; line-height: 1.6; }
.item-tag { font-size: 10.5px; color: var(--muted); border: 1px solid var(--line); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.item-gaps { font-size: 11.5px; color: #8A5A12; margin-top: 4px; }
.item-note { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
.item-actions { display: flex; gap: 14px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.item-toggle { background: none; border: none; padding: 0; font-family: inherit; font-size: 11.5px; color: var(--muted); text-decoration: underline; cursor: pointer; }
.save-toggle { background: none; border: 1px solid var(--line); padding: 3px 9px; font-family: inherit; font-size: 11px; color: var(--muted); cursor: pointer; }
.save-toggle.saved { border-color: var(--ink); color: var(--ink); background: rgba(38,36,32,0.06); }
.item-detail { margin-top: 8px; background: rgba(0,0,0,0.02); border: 1px solid var(--line); padding: 12px 14px; font-size: 12px; line-height: 1.8; display: flex; flex-direction: column; gap: 12px; }
.detail-block p { margin: 4px 0 0; }
.detail-heading { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.02em; margin-bottom: 2px; }
.source-list { margin: 4px 0 0; padding-left: 18px; }
.source-list a { color: #2F6690; }

@media (max-width: 520px) {
  .fs-grid { grid-template-columns: 1fr; }
  .dot-label { display: none; }
  .cat-name { min-width: auto; }
  .data-updated { margin-left: 0; }
}
`;
