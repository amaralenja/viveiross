import { useState } from "react";
import { Calculator as CalcIcon, Delete } from "lucide-react";

type Op = "+" | "-" | "×" | "÷" | null;

export function Calculadora() {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [waitingNew, setWaitingNew] = useState(false);

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

  function toNum(s: string) {
    return Number(s.replace(",", "."));
  }
  function fromNum(n: number) {
    if (!isFinite(n)) return "Erro";
    const s = Number(n.toFixed(10)).toString().replace(".", ",");
    return s;
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
    setDisplay(fromNum(r));
    setAcc(null);
    setOp(null);
    setWaitingNew(true);
  }

  function percent() {
    setDisplay(fromNum(toNum(display) / 100));
  }

  const btn =
    "h-12 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition text-lg font-semibold";
  const btnOp =
    "h-12 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition text-lg font-semibold";
  const btnEq =
    "h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition text-lg font-semibold";

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <CalcIcon className="size-4" /> Calculadora
      </div>
      <div className="rounded-xl bg-muted/40 px-4 py-3 text-right">
        <div className="text-xs text-muted-foreground h-4">
          {acc != null ? `${fromNum(acc)} ${op ?? ""}` : ""}
        </div>
        <div className="text-3xl font-bold tabular-nums truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={clearAll} className={btnOp}>C</button>
        <button type="button" onClick={back} className={btnOp} aria-label="Apagar">
          <Delete className="size-5 mx-auto" />
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

        <button type="button" onClick={() => inputDigit("0")} className={`${btn} col-span-2`}>0</button>
        <button type="button" onClick={inputDot} className={btn}>,</button>
        <button type="button" onClick={equals} className={btnEq}>=</button>
      </div>
    </div>
  );
}
