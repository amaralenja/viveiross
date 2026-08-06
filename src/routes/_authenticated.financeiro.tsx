import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, Plus, TrendingUp, TrendingDown, FileDown, DollarSign, PieChart, Tag, List, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro Pessoal" }] }),
  component: FinanceiroPage,
});

type Lanc = { id: string; tipo: string; descricao: string; valor: number; categoria: string; data: string; observacao: string | null };
type Cat = { id: string; nome: string; icone: string };

const CAT_PADRAO = ["💵 Salário","🍽️ Alimentação","🚗 Transporte","🏠 Moradia","⚡ Energia","💧 Água","📱 Internet","🏥 Saúde","🎓 Educação","🎮 Lazer","💼 Freelance","📦 Compras","🐷 Investimento","📌 Outros"];

function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtD(d: string) { const [y,m,day]=d.split("-"); return `${day}/${m}/${y}`; }
function hoje() { return new Date().toISOString().slice(0,10); }

function FinanceiroPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"lancamentos"|"relatorio"|"categorias">("lancamentos");
  const [editing, setEditing] = useState<Lanc|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tipo,setTipo]=useState<"despesa"|"receita">("despesa");
  const [desc,setDesc]=useState(""); const [val,setVal]=useState("");
  const [cat,setCat]=useState("geral"); const [dt,setDt]=useState(hoje());
  const [obs,setObs]=useState("");
  const [fMes,setFMes]=useState(hoje().slice(0,7));
  const [fCat,setFCat]=useState("todas");
  const [novaCat,setNovaCat]=useState("");

  const { data: lancs=[] } = useQuery({ queryKey: ["fp"], queryFn: async()=>{ const r=await supabase.from("financeiro_pessoal").select("*").order("data",{ascending:false}).order("created_at",{ascending:false}); if(r.error)throw r.error; return(r.data??[]) as Lanc[]; } });
  const { data: cats=[] } = useQuery({ queryKey: ["fp_cats"], queryFn: async()=>{ const r=await supabase.from("categorias_financeiro").select("*").order("nome"); if(r.error)throw r.error; return(r.data??[]) as Cat[]; } });

  const catsUnificadas = useMemo(()=>{
    const set=new Set<string>(["geral"]);
    CAT_PADRAO.forEach(c=>set.add(c.replace(/^.\s*/,"")));
    cats.forEach(c=>set.add(c.nome));
    lancs.forEach(l=>set.add(l.categoria));
    return Array.from(set).sort();
  },[cats,lancs]);

  const filtrados = useMemo(()=>lancs.filter(l=>{
    if(fMes&&!l.data.startsWith(fMes))return false;
    if(fCat!=="todas"&&l.categoria!==fCat)return false;
    return true;
  }),[lancs,fMes,fCat]);

  const tot = useMemo(()=>{
    let rec=0,desp=0; const pc:Record<string,number>={};
    for(const l of filtrados){ if(l.tipo==="receita")rec+=Number(l.valor); else desp+=Number(l.valor); pc[l.categoria]=(pc[l.categoria]??0)+Number(l.valor); }
    return {rec,desp,saldo:rec-desp,pc};
  },[filtrados]);

  const saveMut=useMutation({ mutationFn:async()=>{
    const v=Number(val.replace(",","."));
    if(!desc.trim()||!v||v<=0)throw new Error("Preencha descrição e valor.");
    if(editing){ await supabase.from("financeiro_pessoal").update({tipo,descricao:desc.trim(),valor:v,categoria:cat,data:dt,observacao:obs.trim()||null}).eq("id",editing.id); }
    else { const{data:u}=await supabase.auth.getUser(); await supabase.from("financeiro_pessoal").insert({user_id:u.user?.id,tipo,descricao:desc.trim(),valor:v,categoria:cat,data:dt,observacao:obs.trim()||null}); }
  },onSuccess:()=>{ toast.success(editing?"Atualizado":"Registrado"); reset(); qc.invalidateQueries({queryKey:["fp"]}); },onError:(e:Error)=>toast.error(e.message) });

  const delMut=useMutation({ mutationFn:(id:string)=>supabase.from("financeiro_pessoal").delete().eq("id",id), onSuccess:()=>{ toast.success("Removido"); qc.invalidateQueries({queryKey:["fp"]}); },onError:(e:Error)=>toast.error(e.message) });

  const addCatMut=useMutation({ mutationFn:async(nome:string)=>{
    const{data:u}=await supabase.auth.getUser();
    await supabase.from("categorias_financeiro").insert({user_id:u.user?.id,nome,icone:"📌"});
  },onSuccess:()=>{ toast.success("Categoria adicionada"); setNovaCat(""); qc.invalidateQueries({queryKey:["fp_cats"]}); },onError:(e:Error)=>toast.error(e.message) });

  const delCatMut=useMutation({ mutationFn:(id:string)=>supabase.from("categorias_financeiro").delete().eq("id",id), onSuccess:()=>{ toast.success("Removida"); qc.invalidateQueries({queryKey:["fp_cats"]}); },onError:(e:Error)=>toast.error(e.message) });

  function reset(){ setShowForm(false); setEditing(null); setDesc(""); setVal(""); setCat("geral"); setDt(hoje()); setObs(""); }
  function edit(l:Lanc){ setEditing(l); setTipo(l.tipo as any); setDesc(l.descricao); setVal(String(l.valor)); setCat(l.categoria); setDt(l.data); setObs(l.observacao||""); setShowForm(true); }

  async function pdf(){
    const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const jsPDF = pdfModule.default;
    const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
    const doc=new jsPDF();
    doc.setFontSize(16); doc.text("Financeiro Pessoal",14,20);
    doc.setFontSize(9); doc.text(`Período: ${fMes||"Todos"} · ${fmtD(hoje())}`,14,27);
    doc.setFontSize(12); doc.setTextColor(0,130,70); doc.text(`Receitas: ${brl(tot.rec)}`,14,36);
    doc.setTextColor(180,30,30); doc.text(`Despesas: ${brl(tot.desp)}`,14,43);
    doc.setTextColor(0); doc.text(`Saldo: ${brl(tot.saldo)}`,14,50);
    autoTable(doc, { startY:56, head:[["Data","Tipo","Descrição","Categoria","Valor"]], body:filtrados.map(l=>[fmtD(l.data),l.tipo==="receita"?"Receita":"Despesa",l.descricao,l.categoria,`${l.tipo==="receita"?"+":"-"}${brl(Number(l.valor))}`]), styles:{fontSize:8}, headStyles:{fillColor:[30,41,59]} });
    window.open(URL.createObjectURL(doc.output("blob")));
    toast.success("PDF gerado!");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><DollarSign className="size-5"/></div><div><h1 className="text-xl font-bold">Financeiro Pessoal</h1><p className="text-xs text-muted-foreground">Suas finanças separadas do caixa</p></div></div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(["lancamentos","relatorio","categorias"]as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`flex-1 h-9 rounded-lg font-semibold text-xs transition ${tab===t?"bg-card shadow-sm text-foreground":"text-muted-foreground"}`}>
            {t==="lancamentos"?<><List className="size-3.5 inline mr-1"/>Lançamentos</>:t==="relatorio"?<><BarChart3 className="size-3.5 inline mr-1"/>Relatório</>:<><Tag className="size-3.5 inline mr-1"/>Categorias</>}
          </button>
        ))}
      </div>

      {tab==="lancamentos"&&<>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><p className="text-[10px] uppercase text-emerald-600 font-bold">Receitas</p><p className="text-lg font-black text-emerald-600">{brl(tot.rec)}</p></div>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3"><p className="text-[10px] uppercase text-rose-600 font-bold">Despesas</p><p className="text-lg font-black text-rose-600">{brl(tot.desp)}</p></div>
          <div className={`rounded-xl border p-3 ${tot.saldo>=0?"bg-muted/40":"bg-rose-500/5 border-rose-500/30"}`}><p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo</p><p className={`text-lg font-black ${tot.saldo>=0?"text-foreground":"text-rose-600"}`}>{brl(tot.saldo)}</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="month" value={fMes} onChange={e=>setFMes(e.target.value)} className="app-input h-8 w-auto text-xs"/>
          <select value={fCat} onChange={e=>setFCat(e.target.value)} className="app-input h-8 w-auto text-xs"><option value="todas">Todas categorias</option>{catsUnificadas.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <button onClick={pdf} className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><FileDown className="size-3"/>PDF</button>
          <div className="flex-1"/>
          <button onClick={()=>{reset();setShowForm(true)}} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Plus className="size-3.5"/>Novo</button>
        </div>
        {showForm&&<form onSubmit={e=>{e.preventDefault();saveMut.mutate()}} className="rounded-xl bg-card border p-3 space-y-2">
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
            <button type="button" onClick={()=>setTipo("despesa")} className={`flex-1 h-8 rounded-md font-bold text-xs ${tipo==="despesa"?"bg-rose-500 text-white":"text-muted-foreground"}`}><TrendingDown className="size-3 inline mr-0.5"/>Despesa</button>
            <button type="button" onClick={()=>setTipo("receita")} className={`flex-1 h-8 rounded-md font-bold text-xs ${tipo==="receita"?"bg-emerald-600 text-white":"text-muted-foreground"}`}><TrendingUp className="size-3 inline mr-0.5"/>Receita</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input required value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Descrição" className="app-input h-9 text-xs"/>
            <input required value={val} onChange={e=>setVal(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="Valor R$" className="app-input h-9 text-xs" inputMode="decimal"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={cat} onChange={e=>setCat(e.target.value)} className="app-input h-9 text-xs">{catsUnificadas.map(c=><option key={c} value={c}>{c}</option>)}</select>
            <input type="date" value={dt} onChange={e=>setDt(e.target.value)} className="app-input h-9 text-xs"/>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 h-8 rounded-lg border text-xs font-semibold">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">{saveMut.isPending?"Salvando...":"Salvar"}</button>
          </div>
        </form>}
        {filtrados.length===0?<div className="p-6 rounded-xl border-2 border-dashed text-center text-xs text-muted-foreground">Nenhum lançamento no período.</div>:<div className="space-y-1">
          {filtrados.map(l=><div key={l.id} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-2.5 rounded-lg bg-card border text-xs">
            <span className="text-muted-foreground w-16 shrink-0">{fmtD(l.data)}</span>
            <span className={`font-bold w-24 shrink-0 text-right ${l.tipo==="receita"?"text-emerald-600":"text-rose-600"}`}>{l.tipo==="receita"?"+":"-"}{brl(Number(l.valor))}</span>
            <span className="truncate flex-1 min-w-0 font-medium">{l.descricao}</span>
            <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px] shrink-0">{l.categoria}</span>
            <button onClick={()=>edit(l)} className="size-6 rounded hover:bg-muted flex items-center justify-center shrink-0"><Pencil className="size-3"/></button>
            <button onClick={()=>{if(confirm("Apagar?"))delMut.mutate(l.id)}} className="size-6 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"><Trash2 className="size-3"/></button>
          </div>)}
        </div>}
      </>}

      {tab==="relatorio"&&<>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><p className="text-[10px] uppercase text-emerald-600 font-bold">Receitas</p><p className="text-lg font-black text-emerald-600">{brl(tot.rec)}</p></div>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3"><p className="text-[10px] uppercase text-rose-600 font-bold">Despesas</p><p className="text-lg font-black text-rose-600">{brl(tot.desp)}</p></div>
          <div className={`rounded-xl border p-3 ${tot.saldo>=0?"bg-muted/40":"bg-rose-500/5 border-rose-500/30"}`}><p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo</p><p className={`text-lg font-black ${tot.saldo>=0?"text-foreground":"text-rose-600"}`}>{brl(tot.saldo)}</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="month" value={fMes} onChange={e=>setFMes(e.target.value)} className="app-input h-8 w-auto text-xs"/>
          <button onClick={pdf} className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><FileDown className="size-3"/>PDF</button>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><PieChart className="size-4 text-primary"/>Gastos por Categoria</h3>
          <div className="space-y-1.5">
            {Object.entries(tot.pc).sort((a,b)=>b[1]-a[1]).map(([c,v])=><div key={c} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate text-muted-foreground">{c}</span>
              <div className="flex-1 bg-secondary h-2 rounded-full overflow-hidden"><div className="bg-primary h-full rounded-full" style={{width:`${tot.desp>0?Math.min(100,(v/tot.desp)*100):0}%`}}/></div>
              <span className="w-20 text-right font-semibold">{brl(v)}</span>
            </div>)}
            {Object.keys(tot.pc).length===0&&<p className="text-xs text-muted-foreground">Sem dados no período.</p>}
          </div>
        </div>
      </>}

      {tab==="categorias"&&<>
        <div className="flex gap-2">
          <input value={novaCat} onChange={e=>setNovaCat(e.target.value)} placeholder="Nova categoria" className="app-input h-9 flex-1 text-xs" onKeyDown={e=>{if(e.key==="Enter"&&novaCat.trim())addCatMut.mutate(novaCat.trim())}}/>
          <button onClick={()=>{if(novaCat.trim())addCatMut.mutate(novaCat.trim())}} disabled={addCatMut.isPending} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold"><Plus className="size-3.5"/></button>
        </div>
        <p className="text-[10px] text-muted-foreground">Categorias padrão + suas categorias personalizadas</p>
        <div className="grid grid-cols-2 gap-1.5">
          {catsUnificadas.map((c,i)=>{
            const padrao = CAT_PADRAO.some(p=>p.replace(/^.\s*/,"")===c);
            const catObj = cats.find(x=>x.nome===c);
            return <div key={c} className="flex items-center gap-2 p-2 rounded-lg bg-card border text-xs">
              <span className="font-medium truncate flex-1">{c}</span>
              <span className="text-muted-foreground text-[10px]">{padrao?"padrão":"custom"}</span>
              {catObj&&!padrao&&<button onClick={()=>{if(confirm(`Remover categoria "${c}"?`))delCatMut.mutate(catObj.id)}} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3"/></button>}
            </div>;
          })}
        </div>
      </>}
    </div>
  );
}
