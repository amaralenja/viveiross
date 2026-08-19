import { useState, useEffect, useRef } from "react";
import { Calculator as CalcIcon, Delete, X, History, Copy, Trash2, Minus } from "lucide-react";
import { toast } from "sonner";

type Op = "+" | "-" | "×" | "÷" | null;

type CalcHistoryItem = {
  id: string;
  expressao: string;
  resultado: string;
  dataHora: string;
};

export function CalculadoraPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<"calc" | "history">("calc");

  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [waitingNew, setWaitingNew] = useState(false);
  const [historico, setHistorico] = useState<CalcHistoryItem[]>([]);

  const popupRef = useRef<HTMLDivElement>(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("app_calc_history");
      if (saved) {
        setHistorico(JSON.parse(saved));
      }
    } catch {
      setHistorico([]);
    }
  }, []);

  // Salvar histórico no localStorage
  function salvarHistorico(novos: CalcHistoryItem[]) {
    setHistorico(novos);
    try {
      localStorage.setItem("app_calc_history", JSON.stringify(novos.slice(0, 50)));
    } catch {
      // ignore
    }
  }

  function toNum(s: string) {
    return Number(s.replace(",", "."));
  }

  function fromNum(n: number) {
    if (!isFinite(n)) return "Erro";
    const s = Number(n.toFixed(10)).toString().replace(".", ",");
    return s;
  }

  function inputDigit(d: string) {
    if (waitingNew) {
      setDisplay(d);
      setWaitingNew(false);
    } else {
      setDisplay(display === "0" ? d : display + d);
    }
  }

  function inputDot() {
    if (waitingNew) {
      setDisplay("0,");
      setWaitingNew(false);
      return;
    }
    if (!display.includes(",")) setDisplay(display + ",");
  }

  function toggleSign() {
    if (display === "0") return;
    if (display.startsWith("-")) {
      setDisplay(display.slice(1));
    } else {
      setDisplay("-" + display);
    }
  }

  function clearAll() {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setWaitingNew(false);
  }

  function back() {
    if (waitingNew) return;
    setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
  }

  function apply(a: number, b: number, o: Op): number {
    switch (o) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function setOperator(next: Op) {
    const cur = toNum(display);
    if (acc == null) {
      setAcc(cur);
    } else if (!waitingNew && op) {
      const r = apply(acc, cur, op);
      setAcc(r);
      setDisplay(fromNum(r));
    }
    setOp(next);
    setWaitingNew(true);
  }

  function equals() {
    if (op == null || acc == null) return;
    const cur = toNum(display);
    const r = apply(acc, cur, op);
    const resStr = fromNum(r);

    const expressao = `${fromNum(acc)} ${op} ${fromNum(cur)}`;
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const novoItem: CalcHistoryItem = {
      id: String(Date.now()),
      expressao,
      resultado: resStr,
      dataHora: hora,
    };

    salvarHistorico([novoItem, ...historico]);
    setDisplay(resStr);
    setAcc(null);
    setOp(null);
    setWaitingNew(true);
  }

  function percent() {
    setDisplay(fromNum(toNum(display) / 100));
  }

  function copiarResultado(val: string) {
    navigator.clipboard.writeText(val);
    toast.success(`Copiado: ${val}`);
  }

  function usarResultado(val: string) {
    setDisplay(val);
    setWaitingNew(false);
    setActiveTab("calc");
    toast.info(`Valor ${val} inserido na calculadora`);
  }

  function limparHistorico() {
    salvarHistorico([]);
    toast.success("Histórico de cálculos limpo");
  }

  const btn =
    "h-11 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition text-base font-semibold shadow-xs flex items-center justify-center";
  const btnOp =
    "h-11 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition text-base font-bold flex items-center justify-center";
  const btnEq =
    "h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition text-base font-bold flex items-center justify-center shadow-sm";

  return (
    <div className="fixed bottom-16 right-4 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end">
      {/* Botão Flutuante quando fechado ou minimizado */}
      {(!isOpen || isMinimized) && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="group h-12 px-4 rounded-full bg-gradient-to-r from-emerald-600 via-primary to-emerald-700 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 border border-white/20"
          title="Calculadora Rápida"
        >
          <CalcIcon className="size-5 text-white animate-pulse" />
          <span className="text-xs font-bold tracking-wide">Calculadora</span>
          {historico.length > 0 && (
            <span className="size-5 rounded-full bg-white/20 text-[10px] flex items-center justify-center font-extrabold">
              {historico.length}
            </span>
          )}
        </button>
      )}

      {/* Janela Popup da Calculadora */}
      {isOpen && !isMinimized && (
        <div
          ref={popupRef}
          className="w-[320px] sm:w-[340px] rounded-3xl border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Top Bar / Header da Janela */}
          <div className="bg-gradient-to-r from-emerald-600 via-primary to-emerald-700 px-4 py-3 text-white flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CalcIcon className="size-4" />
              <span>Calculadora</span>
            </div>

            {/* Abas Calc vs Histórico */}
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("calc")}
                className={`px-2.5 py-0.5 rounded-lg transition ${activeTab === "calc" ? "bg-white text-emerald-800 font-bold" : "text-white/80 hover:text-white"}`}
              >
                Teclado
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`px-2.5 py-0.5 rounded-lg transition flex items-center gap-1 ${activeTab === "history" ? "bg-white text-emerald-800 font-bold" : "text-white/80 hover:text-white"}`}
              >
                <History className="size-3" /> ({historico.length})
              </button>
            </div>

            {/* Minimizar e Fechar */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="size-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition"
                title="Minimizar"
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="size-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition"
                title="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Conteúdo Aba Calculadora */}
          {activeTab === "calc" && (
            <div className="p-4 space-y-3">
              {/* Visor / Display */}
              <div
                onClick={() => copiarResultado(display)}
                className="rounded-2xl bg-muted/50 border p-3 text-right cursor-pointer hover:bg-muted/80 transition relative group"
                title="Clique para copiar o valor"
              >
                <div className="text-[11px] font-medium text-muted-foreground h-4 tracking-wide">
                  {acc != null ? `${fromNum(acc)} ${op ?? ""}` : ""}
                </div>
                <div className="text-3xl font-black text-foreground tabular-nums truncate">{display}</div>
                <Copy className="size-3 text-muted-foreground absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition" />
              </div>

              {/* Teclado */}
              <div className="grid grid-cols-4 gap-2">
                <button type="button" onClick={clearAll} className={btnOp}>AC</button>
                <button type="button" onClick={back} className={btnOp} aria-label="Apagar">
                  <Delete className="size-4" />
                </button>
                <button type="button" onClick={percent} className={btnOp}>%</button>
                <button type="button" onClick={() => setOperator("÷")} className={btnOp}>÷</button>

                <button type="button" onClick={() => inputDigit("7")} className={btn}>7</button>
                <button type="button" onClick={() => inputDigit("8")} className={btn}>8</button>
                <button type="button" onClick={() => inputDigit("9")} className={btn}>9</button>
                <button type="button" onClick={() => setOperator("×")} className={btnOp}>×</button>

                <button type="button" onClick={() => inputDigit("4")} className={btn}>4</button>
                <button type="button" onClick={() => inputDigit("5")} className={btn}>5</button>
                <button type="button" onClick={() => inputDigit("6")} className={btn}>6</button>
                <button type="button" onClick={() => setOperator("-")} className={btnOp}>−</button>

                <button type="button" onClick={() => inputDigit("1")} className={btn}>1</button>
                <button type="button" onClick={() => inputDigit("2")} className={btn}>2</button>
                <button type="button" onClick={() => inputDigit("3")} className={btn}>3</button>
                <button type="button" onClick={() => setOperator("+")} className={btnOp}>+</button>

                <button type="button" onClick={toggleSign} className={btn}>±</button>
                <button type="button" onClick={() => inputDigit("0")} className={btn}>0</button>
                <button type="button" onClick={inputDot} className={btn}>,</button>
                <button type="button" onClick={equals} className={btnEq}>=</button>
              </div>
            </div>
          )}

          {/* Conteúdo Aba Histórico de Somas */}
          {activeTab === "history" && (
            <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Histórico de Cálculos</span>
                {historico.length > 0 && (
                  <button
                    type="button"
                    onClick={limparHistorico}
                    className="text-xs text-destructive hover:underline font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="size-3.5" /> Limpar
                  </button>
                )}
              </div>

              {historico.length === 0 ? (
                <div className="p-8 border-2 border-dashed rounded-2xl text-center text-xs text-muted-foreground space-y-1">
                  <History className="size-8 mx-auto text-muted-foreground/60" />
                  <p className="font-semibold">Nenhum cálculo no histórico</p>
                  <p>Faça contas na calculadora e os resultados aparecerão aqui.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historico.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-2xl bg-muted/40 border flex items-center justify-between gap-3 text-xs shadow-2xs hover:bg-muted transition"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-mono">{h.expressao} =</p>
                        <p className="text-base font-black text-foreground tabular-nums">{h.resultado}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{h.dataHora}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => usarResultado(h.resultado)}
                          className="h-8 px-2.5 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition text-[11px]"
                          title="Usar valor na calculadora"
                        >
                          Usar
                        </button>
                        <button
                          type="button"
                          onClick={() => copiarResultado(h.resultado)}
                          className="size-8 rounded-xl border flex items-center justify-center hover:bg-background transition"
                          title="Copiar resultado"
                        >
                          <Copy className="size-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mantendo o export Inline original para compatibilidade
export function Calculadora() {
  return <CalculadoraPopup />;
}
