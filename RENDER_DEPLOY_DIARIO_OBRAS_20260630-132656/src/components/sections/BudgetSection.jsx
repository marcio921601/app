import { useMemo, useState } from "react";
import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { formatCurrency } from "@/utils/formatters";

export function BudgetSection({
  orcamento,
  referenciasNivel4,
  totalOrcamento,
  budgetSearch,
  budgetFiltered,
  onSetBudgetSearch,
  onRequestImport,
  onAddItem,
  onUpdateOrcamento,
  onRemoveItem,
  onRemoveItems,
}) {
  const [selectedItems, setSelectedItems] = useState([]);
  const visibleRows = budgetFiltered.slice(0, 300);
  const visibleIndices = useMemo(() => visibleRows.map((item) => item.__index), [visibleRows]);
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);

  function toggleSelected(index) {
    setSelectedItems((prev) => (prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]));
  }

  function selectVisibleRows() {
    setSelectedItems((prev) => Array.from(new Set([...prev, ...visibleIndices])));
  }

  function removeSelectedRows() {
    onRemoveItems(selectedItems);
    setSelectedItems([]);
  }

  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-3">
        <StatCard label="Itens no orcamento" value={orcamento.length} />
        <StatCard label="Itens nivel 4" value={referenciasNivel4.length} />
        <StatCard label="Valor total" value={formatCurrency(totalOrcamento)} tone="accent" />
      </div>

      <Card
        title="Banco de orcamento da obra"
        subtitle="Filtro rapido, importacao e edicao manual dos itens."
        actions={<button type="button" className="btn btn-secondary" onClick={onAddItem}>Adicionar item</button>}
      >
        <div className="toolbar-grid">
          <Field label="Buscar por referencia ou descricao">
            <input value={budgetSearch} onChange={(event) => onSetBudgetSearch(event.target.value)} placeholder="Ex.: 1001001001, aco, fundacao" />
          </Field>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-secondary" onClick={onRequestImport}>Importar planilhas</button>
          </div>
        </div>

        <div className="bulk-actions">
          <span className="status-chip">{selectedItems.length} selecionado(s)</span>
          <button type="button" className="btn btn-secondary" onClick={selectVisibleRows}>Selecionar filtrados</button>
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedItems([])}>Limpar selecao</button>
          <button type="button" className="btn btn-danger" disabled={!selectedItems.length} onClick={removeSelectedRows}>Excluir selecionados</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Selecionar</th>
                <th>Nivel</th>
                <th>Referencia</th>
                <th>Descricao</th>
                <th>Qtd. orcada</th>
                <th>Unidade</th>
                <th>Preco total</th>
                <th>BDI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((item) => {
                const originalIndex = item.__index;
                return (
                  <tr key={`${item.referencia}-${item.descricao}-${originalIndex}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(originalIndex)}
                        onChange={() => toggleSelected(originalIndex)}
                        aria-label={`Selecionar item ${item.referencia || originalIndex + 1}`}
                      />
                    </td>
                    <td><input type="number" value={item.nivel} onChange={(event) => onUpdateOrcamento(originalIndex, "nivel", event.target.value)} /></td>
                    <td><input value={item.referencia} onChange={(event) => onUpdateOrcamento(originalIndex, "referencia", event.target.value)} /></td>
                    <td><input value={item.descricao} onChange={(event) => onUpdateOrcamento(originalIndex, "descricao", event.target.value)} /></td>
                    <td><input type="number" value={item.qtdeOrcada} onChange={(event) => onUpdateOrcamento(originalIndex, "qtdeOrcada", event.target.value)} /></td>
                    <td><input value={item.unidade} onChange={(event) => onUpdateOrcamento(originalIndex, "unidade", event.target.value)} /></td>
                    <td><input type="number" value={item.precoTotal} onChange={(event) => onUpdateOrcamento(originalIndex, "precoTotal", event.target.value)} /></td>
                    <td><input type="number" value={item.bdi} onChange={(event) => onUpdateOrcamento(originalIndex, "bdi", event.target.value)} /></td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          onRemoveItem(originalIndex);
                          setSelectedItems((prev) => prev.filter((index) => index !== originalIndex));
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="inline-note">
          <strong>Desempenho</strong>
          <span>O app exibe ate 300 linhas filtradas por vez para manter resposta rapida sem perder compatibilidade.</span>
        </div>
      </Card>
    </div>
  );
}
