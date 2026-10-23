function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


import {formatNumber,toNumber,uniqueSorted} from '../utils/formatters';
function formatFuncaoResumo(resumo={}) {return Object.entries(resumo).map(([f,n])=>n+' '+f).join(', ');}
export function downloadJson(data,name='diario.json') {downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);}
export async function exportProductivity(data,derived,currentUser,currentAccess,setStatusMessage) {
const {historicoOrdenado,servicosCalculados}=derived;
const budgetMap=new Map(data.orcamento.map(row=>[String(row.referencia),row]));
  async function exportProdutividadeExcel() {
    try {
      const XLSX = await import("xlsx");
      const records = [
        ...historicoOrdenado.flatMap((snapshot) =>
          (snapshot.servicos || []).map((item, index) => ({
            source: "Historico",
            snapshot,
            item,
            atividade: (snapshot.atividades || [])[index] || {},
            index,
          }))
        ),
        ...servicosCalculados.map((item, index) => ({
          source: "Rascunho atual",
          snapshot: {
            id: "rascunho-atual",
            createdAt: data.updatedAt,
            updatedBy: currentUser.nome || currentUser.login || currentAccess.label,
            updatedByPerfil: currentUser.perfil,
            cabecalho: data.cabecalho,
          },
          item,
          atividade: item,
          index,
        })),
      ];

      const rows = records.map(({ source, snapshot, item, atividade, index }) => {
        const referenciaNivel4 = item.orcamentoRef || atividade.orcamentoRef || "";
        const itemOrcado = budgetMap.get(String(referenciaNivel4));
        const qtdeOrcada = toNumber(item.qtdeOrcada || itemOrcado?.qtdeOrcada);
        const quantidadeExecutada = toNumber(item.quantidadeProduzida);
        const percentualExecutado =
          item.percentualExecutado !== "" && item.percentualExecutado != null
            ? toNumber(item.percentualExecutado)
            : qtdeOrcada > 0
              ? (quantidadeExecutada / qtdeOrcada) * 100
              : toNumber(item.pctExecutado);
        const codigoNivel3 = item.orcamentoNivel3Ref || atividade.orcamentoNivel3Ref || "";
        const descricaoNivel3 = item.orcamentoNivel3Descricao || atividade.orcamentoNivel3Descricao || "";
        const pessoasPorFuncao = item.pessoasPorFuncao || atividade.pessoasPorFuncao || {};
        const row = {
          Atividade: item.servico || atividade.tarefa || "",
          "Item Nivel 3": [codigoNivel3, descricaoNivel3].filter(Boolean).join(" - "),
          "% executada": percentualExecutado,
          Unidade: item.unidade || atividade.unidade || itemOrcado?.unidade || "",
          Inicio: item.inicio || atividade.inicio || "",
          Fim: item.fim || atividade.fim || "",
          "Profissionais por funcao": item.pessoasPorFuncaoTexto || atividade.pessoasPorFuncaoTexto || formatFuncaoResumo(pessoasPorFuncao),
          Pessoas: toNumber(item.qtdPessoas || atividade.qtdPessoas),
          Data: snapshot.cabecalho?.data || "",
          Obra: snapshot.cabecalho?.obra || "",
          Frente: item.local || atividade.local || "",
          Equipe: item.equipe || atividade.equipe || "",
          "Codigo nivel 3": codigoNivel3,
          "Descricao nivel 3": descricaoNivel3,
          "Codigo nivel 4": referenciaNivel4,
          "Descricao nivel 4": item.orcamentoDescricao || atividade.orcamentoDescricao || itemOrcado?.descricao || "",
          "Qtd. orcada": qtdeOrcada,
          "Quantidade executada": quantidadeExecutada,
          Horas: toNumber(item.horasTrabalhadas || atividade.horasTrabalhadas),
          HH: toNumber(item.hh || atividade.hh),
          "un/HH": toNumber(item.prodUnPorHH),
          "HH/un": toNumber(item.prodHHPorUn),
          "Valor realizado": toNumber(item.valorExecutado),
          Fonte: source,
          "ID registro": snapshot.id || "",
          "Criado em": snapshot.createdAt || "",
          "Atualizado por": snapshot.updatedBy || "",
          Perfil: snapshot.updatedByPerfil || "",
          "Linha atividade": index + 1,
        };
        uniqueSorted(Object.keys(pessoasPorFuncao)).forEach((funcao) => {
          row[`Funcao - ${funcao}`] = pessoasPorFuncao[funcao] || 0;
        });
        return row;
      });

      const rowsPorFuncao = records.flatMap(({ source, snapshot, item, atividade, index }) => {
        const pessoasPorFuncao = item.pessoasPorFuncao || atividade.pessoasPorFuncao || {};
        const referenciaNivel4 = item.orcamentoRef || atividade.orcamentoRef || "";
        const itemOrcado = budgetMap.get(String(referenciaNivel4));
        const quantidadeExecutada = toNumber(item.quantidadeProduzida);
        return Object.entries(pessoasPorFuncao).map(([funcao, totalProfissionais]) => {
          const horas = toNumber(item.horasTrabalhadas || atividade.horasTrabalhadas);
          const hhFuncao = toNumber(totalProfissionais) * horas;
          return {
            Atividade: item.servico || atividade.tarefa || "",
            "Item Nivel 3": [item.orcamentoNivel3Ref || atividade.orcamentoNivel3Ref || "", item.orcamentoNivel3Descricao || atividade.orcamentoNivel3Descricao || ""]
              .filter(Boolean)
              .join(" - "),
            "% executada": toNumber(item.percentualExecutado || item.pctExecutado),
            Funcao: funcao,
            "Profissionais da funcao": totalProfissionais,
            Unidade: item.unidade || atividade.unidade || itemOrcado?.unidade || "",
            Data: snapshot.cabecalho?.data || "",
            Obra: snapshot.cabecalho?.obra || "",
            Frente: item.local || atividade.local || "",
            Inicio: item.inicio || atividade.inicio || "",
            Fim: item.fim || atividade.fim || "",
            "Horas por profissional": horas,
            "HH da funcao": hhFuncao,
            "Quantidade executada da atividade": quantidadeExecutada,
            "un/HH da funcao": hhFuncao > 0 ? quantidadeExecutada / hhFuncao : 0,
            "HH/un da funcao": quantidadeExecutada > 0 ? hhFuncao / quantidadeExecutada : 0,
            Fonte: source,
            "ID registro": snapshot.id || "",
            "Linha atividade": index + 1,
          };
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const worksheetPorFuncao = XLSX.utils.json_to_sheet(rowsPorFuncao);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Banco de dados");
      XLSX.utils.book_append_sheet(workbook, worksheetPorFuncao, "Por funcao");
      const payload = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      downloadBlob(new Blob([payload], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `produtividade-${data.cabecalho?.data || "sem-data"}.xlsx`);
      setStatusMessage("Banco completo de produtividade exportado para Excel, incluindo historico e rascunho atual.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Nao foi possivel exportar a produtividade para Excel.");
    }
  }


return exportProdutividadeExcel();
}
