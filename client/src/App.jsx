import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MODE_DEFS = [
  { key: 'normal', label: '正常' },
  { key: 'protan', label: '红弱' },
  { key: 'deutan', label: '绿弱' },
  { key: 'tritan', label: '蓝弱' },
];

const DEFAULT_COLORS = [
  { label: '蓝', hex: '#0072B2' },
  { label: '橙', hex: '#E69F00' },
  { label: '绿', hex: '#009E73' },
  { label: '红', hex: '#D55E00' },
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.errors || [res.statusText]).join('；'));
  return data;
}

function Swatch({ hex, label, small }) {
  return (
    <span className={`swatch ${small ? 'swatch-sm' : ''}`} title={hex}>
      <span className="swatch-chip" style={{ background: hex }} />
      {label !== undefined && <span className="swatch-label">{label}</span>}
      <span className="swatch-hex">{hex}</span>
    </span>
  );
}

export default function App() {
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [threshold, setThreshold] = useState(12);
  const [modes, setModes] = useState({ normal: true, protan: true, deutan: true, tritan: true });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [replaceIndex, setReplaceIndex] = useState(0);
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const debounceRef = useRef(null);

  const activeModes = useMemo(() => MODE_DEFS.filter((m) => modes[m.key]).map((m) => m.key), [modes]);

  const evaluate = useCallback(async (cols, thr, md) => {
    try {
      const data = await postJson('/api/evaluate', { colors: cols, threshold: thr, modes: md });
      setResult(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Re-evaluate (debounced) whenever palette / threshold / modes change.
  useEffect(() => {
    if (activeModes.length === 0) {
      setResult(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => evaluate(colors, threshold, activeModes), 250);
    return () => clearTimeout(debounceRef.current);
  }, [colors, threshold, activeModes, evaluate]);

  const updateColor = (i, patch) => {
    setColors((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
    setSuggestion(null);
  };

  const addColor = () => {
    if (colors.length >= 8) return;
    setColors((cs) => [...cs, { label: `色 ${cs.length + 1}`, hex: '#8c8c8c' }]);
    setSuggestion(null);
  };

  const removeColor = (i) => {
    if (colors.length <= 2) return;
    setColors((cs) => cs.filter((_, k) => k !== i));
    setReplaceIndex((r) => Math.max(0, Math.min(r, colors.length - 2)));
    setSuggestion(null);
  };

  const runSuggest = async () => {
    setSuggesting(true);
    try {
      const data = await postJson('/api/suggest', {
        colors,
        threshold,
        modes: activeModes,
        replaceIndex,
      });
      setSuggestion(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    updateColor(suggestion.replaceIndex, { hex: suggestion.hex });
  };

  return (
    <div className="app">
      <header>
        <h1>色觉安全图例校验台</h1>
        <p className="subtitle">
          线性 RGB 模拟色觉缺陷 · Lab 空间 CIEDE2000 色对距离 · 跨模式替换推荐
        </p>
      </header>

      <div className="layout">
        <aside className="panel">
          <h2>调色板（{colors.length}/8）</h2>
          {colors.map((c, i) => (
            <div className="color-row" key={i}>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#000000'}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
              />
              <input
                className="hex-input"
                value={c.hex}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
                spellCheck={false}
              />
              <input
                className="label-input"
                value={c.label}
                placeholder={`色 ${i + 1}`}
                onChange={(e) => updateColor(i, { label: e.target.value })}
              />
              <button
                className="icon-btn"
                title="移除"
                disabled={colors.length <= 2}
                onClick={() => removeColor(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="btn" onClick={addColor} disabled={colors.length >= 8}>
            + 添加颜色
          </button>

          <h2>阈值（CIEDE2000）</h2>
          <div className="threshold-row">
            <input
              type="range"
              min="1"
              max="40"
              step="0.5"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <span className="threshold-value">ΔE ≥ {threshold}</span>
          </div>

          <h2>视觉模式</h2>
          {MODE_DEFS.map((m) => (
            <label className="mode-check" key={m.key}>
              <input
                type="checkbox"
                checked={modes[m.key]}
                onChange={(e) => setModes((s) => ({ ...s, [m.key]: e.target.checked }))}
              />
              {m.label}
              {result?.worstMode === m.key && <span className="badge badge-worst">最差</span>}
            </label>
          ))}

          <h2>替换推荐</h2>
          <p className="hint">锁定其余颜色，仅替换选定色：</p>
          <div className="suggest-row">
            <select value={replaceIndex} onChange={(e) => setReplaceIndex(Number(e.target.value))}>
              {colors.map((c, i) => (
                <option key={i} value={i}>
                  {c.label}（{c.hex}）
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={runSuggest} disabled={suggesting || !result}>
              {suggesting ? '搜索中…' : '推荐替换色'}
            </button>
          </div>

          {suggestion && (
            <div className="suggestion-card">
              <div className="suggestion-swatches">
                <div>
                  <div className="hint">原色</div>
                  <Swatch hex={suggestion.originalHex} />
                </div>
                <div className="arrow">→</div>
                <div>
                  <div className="hint">推荐</div>
                  <Swatch hex={suggestion.hex} />
                </div>
              </div>
              <ul className="suggestion-stats">
                <li>
                  跨模式最小距离：<strong>{suggestion.minDistance}</strong>{' '}
                  {suggestion.pass ? '✅ 达标' : '⚠️ 仍低于阈值'}
                </li>
                <li>与原色改变量：ΔE {suggestion.change}</li>
                {Object.entries(suggestion.perMode).map(([m, d]) => (
                  <li key={m}>
                    {MODE_DEFS.find((x) => x.key === m)?.label ?? m} 模式最小距离：{d}
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary" onClick={applySuggestion}>
                应用此替换
              </button>
            </div>
          )}

          {error && <div className="error">{error}</div>}
        </aside>

        <main>
          {result && (
            <>
              <div className={`banner ${result.worstMinDistance >= threshold ? 'banner-ok' : 'banner-bad'}`}>
                {result.worstMinDistance >= threshold ? '✅ 全部模式达标' : '⚠️ 存在不达标色对'}
                ｜最差模式：
                <strong>{MODE_DEFS.find((m) => m.key === result.worstMode)?.label}</strong>
                （最小 ΔE {result.worstMinDistance}，阈值 {result.threshold}）
              </div>

              {MODE_DEFS.filter((m) => result.modes[m.key]).map((m) => {
                const md = result.modes[m.key];
                const failing = md.pairs.filter((p) => !p.pass);
                return (
                  <section className="mode-section" key={m.key}>
                    <h3>
                      {m.label}
                      {result.worstMode === m.key && <span className="badge badge-worst">最差模式</span>}
                      <span className="min-dist">最小 ΔE {md.minDistance}</span>
                      {failing.length > 0 && (
                        <span className="badge badge-fail">{failing.length} 对不达标</span>
                      )}
                    </h3>

                    <div className="swatch-grid" style={{ gridTemplateColumns: `repeat(${colors.length}, 1fr)` }}>
                      {colors.map((c, i) => (
                        <div className="swatch-pair" key={i}>
                          <div className="pair-title">{c.label}</div>
                          <div className="pair-chips">
                            <span className="chip" style={{ background: c.hex }} title={`原色 ${c.hex}`} />
                            <span className="chip" style={{ background: md.simHexes[i] }} title={`模拟 ${md.simHexes[i]}`} />
                          </div>
                          <div className="pair-hex">
                            <span>{c.hex}</span>
                            <span>{md.simHexes[i]}</span>
                          </div>
                          <div className="pair-caption">原色 ｜ 模拟</div>
                        </div>
                      ))}
                    </div>

                    <table className="pair-table">
                      <thead>
                        <tr>
                          <th>色对</th>
                          <th></th>
                          <th>ΔE2000</th>
                          <th>判定</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...md.pairs]
                          .sort((a, b) => a.distance - b.distance)
                          .map((p) => (
                            <tr key={`${p.i}-${p.j}`} className={p.pass ? '' : 'row-fail'}>
                              <td>
                                {p.a} ↔ {p.b}
                              </td>
                              <td className="mini-chips">
                                <span className="chip chip-mini" style={{ background: md.simHexes[p.i] }} />
                                <span className="chip chip-mini" style={{ background: md.simHexes[p.j] }} />
                              </td>
                              <td>{p.distance}</td>
                              <td>{p.pass ? '✅' : '❌ 不达标'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </>
          )}
          {!result && !error && <p className="hint">请至少选择一种视觉模式。</p>}
        </main>
      </div>
    </div>
  );
}
