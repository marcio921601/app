import { useRef } from "react";
import { Card } from "@/components/common/Card";
import { IssueSummary } from "@/components/common/IssueSummary";
import { StatCard } from "@/components/common/StatCard";
import { TabsBar } from "@/components/common/TabsBar";
import { AdministrationSection } from "@/components/sections/AdministrationSection";
import { BudgetSection } from "@/components/sections/BudgetSection";
import { CadastrosSection } from "@/components/sections/CadastrosSection";
import { DashboardSection } from "@/components/sections/DashboardSection";
import { DiarySection } from "@/components/sections/DiarySection";
import { GerencialSection } from "@/components/sections/GerencialSection";
import { HistorySection } from "@/components/sections/HistorySection";
import { MultiobraSection } from "@/components/sections/MultiobraSection";
import { ProductivitySection } from "@/components/sections/ProductivitySection";
import { PrintLayout } from "@/components/print/PrintLayout";
import { ITAUBA_LOGO } from "@/data/defaults";
import { useDiaryApp } from "@/hooks/useDiaryApp";
import { formatCurrency, formatNumber } from "@/utils/formatters";

function getSaveLabel(saveState) {
  const map = {
    idle: "Pronto",
    dirty: "Edicao em andamento",
    saved: "Auto-salvo",
  };
  return map[saveState] || "Pronto";
}

export default function App() {
  const fileInputRef = useRef(null);
  const {
    data,
    activeTab,
    activeDiaryTab,
    budgetSearch,
    dashboardFilters,
    statusMessage,
    saveState,
    syncState,
    backendEnabled,
    access,
    derived,
    actions,
  } = useDiaryApp();

  const {
    obraAtiva,
    totalPrevisto,
    totalPresentes,
    totalHH,
    totalQtd,
    totalOrcamento,
    totalRealizadoEstimado,
    budgetFiltered,
    referenciasNivel3,
    referenciasNivel4,
    nivel4ByNivel3,
    servicosCalculados,
    servicosVinculados,
    mediaProdutividade,
    producaoPorUnidade,
    profissionaisObraAtiva,
    profissionaisDisponiveis,
    profissionaisPresentes,
    afastamentosAtivosNoDia,
    afastamentoEvolucao,
    funcionariosResumo,
    filtrosObra,
    filtrosFrente,
    filtrosEquipe,
    historicoOrdenado,
    dashboardResumo,
    dashboardEvolucao,
    dashboardServicos,
    dashboardOrcamento,
    gerencialIndicadores,
    indicadoresObraAtiva,
    resumoROS,
    validation,
    getWeekday,
  } = derived;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        className="sr-only"
        onChange={actions.importBudgetFile}
      />

      <div className="screen-shell">
        <div className="shell-inner">
          <header className="hero">
            <div className="hero-copy">
              <div className="hero-badges">
                <span className="badge badge-brand">Sistema Itauba</span>
                <span className="badge">Perfil: {access.isPreviewing ? `${access.actualAccess.label} vendo ${access.currentAccess.label}` : access.currentAccess.label}</span>
                <span className="badge">Usuario: {access.currentUser.nome || access.currentUser.login || "-"}</span>
                <span className="badge">{backendEnabled ? "Backend configuravel" : "Backend preparado"}</span>
              </div>

              <div>
                <h1 className="hero-title">Controle diario de obra com visao multiobra</h1>
                <p className="hero-text">
                  O app foi reorganizado para separar componentes, melhorar a persistencia local, preparar a camada de backend
                  e manter o modelo de dados compativel com o que ja existia.
                </p>
              </div>

              <div className="hero-meta">
                <div>
                  <span>Obra ativa</span>
                  <strong>{obraAtiva?.nome || data.cabecalho.obra}</strong>
                </div>
                <div>
                  <span>Codigo</span>
                  <strong>{obraAtiva?.codigo || "-"}</strong>
                </div>
                <div>
                  <span>Responsavel</span>
                  <strong>{obraAtiva?.responsavel || "-"}</strong>
                </div>
                <div>
                  <span>Cliente / local</span>
                  <strong>{obraAtiva?.cliente || "-"}{obraAtiva?.local ? ` | ${obraAtiva.local}` : ""}</strong>
                </div>
              </div>
            </div>

            <aside className="hero-side">
              <div className="logo-card">
                <img src={ITAUBA_LOGO} alt="Marca Itauba" />
              </div>

              <div className="hero-actions">
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Importar planilhas
                </button>
                <button type="button" disabled={!access.canEditTab("historico")} className="btn btn-secondary" onClick={actions.saveCurrentToHistory}>
                  Salvar dia no historico
                </button>
                <button type="button" className="btn btn-primary" onClick={actions.saveNow}>
                  Salvar dados locais
                </button>
                {access.isPreviewing ? (
                  <button type="button" className="btn btn-secondary" onClick={() => actions.setVisualizarComoPerfil("")}>
                    Voltar ao administrativo
                  </button>
                ) : null}
                <div className="button-row">
                  <button type="button" className="btn btn-secondary" onClick={actions.exportJson}>
                    Exportar JSON
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={actions.printReport}>
                    Gerar PDF
                  </button>
                </div>
              </div>
            </aside>
          </header>

          <section className="status-banner">
            <div>
              <strong>Status do ambiente</strong>
              <p>{statusMessage}</p>
            </div>
            <div className="status-tray">
              <span className="status-chip">{getSaveLabel(saveState)}</span>
              <span className="status-chip">{backendEnabled ? "API pronta" : "Local + backup"}</span>
              <span className="status-chip">{syncState === "syncing" ? "Sincronizando" : syncState === "synced" ? "Sincronizado" : "Sem sync"}</span>
            </div>
          </section>

          <IssueSummary errors={validation.errors} warnings={validation.warnings} />

          <div className="stats-grid stats-grid-5">
            <StatCard label="Obras cadastradas" value={data.multiobra?.obras?.length || 0} />
            <StatCard label="Presentes" value={totalPresentes} tone="success" />
            <StatCard label="Servicos lancados" value={data.servicos.length} />
            <StatCard label="HH total" value={formatNumber(totalHH)} />
            <StatCard label="Valor realizado" value={formatCurrency(totalRealizadoEstimado)} tone="accent" />
          </div>

          <Card bodyClassName="tab-card-body">
            <TabsBar items={access.visibleTabs} value={activeTab} onChange={actions.setActiveTab} />

            <div className="tab-panel">
              {activeTab === "multiobra" ? (
                <MultiobraSection
                  data={data}
                  obraAtiva={obraAtiva}
                  indicadoresObraAtiva={indicadoresObraAtiva}
                  backendEnabled={backendEnabled}
                  syncState={syncState}
                  onSync={actions.syncBackend}
                  onSelectObra={actions.selectObraAtiva}
                  onApplyObraAtiva={actions.applyObraAtivaAoDiario}
                  onAddObra={actions.addObra}
                  onUpdateObra={actions.updateObra}
                  onRemoveObra={actions.removeObra}
                />
              ) : null}

              {activeTab === "cadastros" ? (
                <CadastrosSection
                  data={data}
                  obraAtiva={obraAtiva}
                  profissionaisObraAtiva={profissionaisObraAtiva}
                  afastamentosAtivosNoDia={afastamentosAtivosNoDia}
                  afastamentoEvolucao={afastamentoEvolucao}
                  readOnly={!access.canEditTab("cadastros")}
                  onSelectObra={actions.selectObraAtiva}
                  onAddProfissional={actions.addProfissional}
                  onUpdateProfissional={actions.updateProfissional}
                  onRemoveProfissional={actions.removeProfissional}
                  onAddAfastamento={actions.addAfastamento}
                  onUpdateAfastamento={actions.updateAfastamento}
                  onRemoveAfastamento={actions.removeAfastamento}
                />
              ) : null}

              {activeTab === "diario" ? (
                <DiarySection
                  data={data}
                  activeDiaryTab={activeDiaryTab}
                  totalPrevisto={totalPrevisto}
                  totalPresentes={totalPresentes}
                  profissionaisDisponiveis={profissionaisDisponiveis}
                  profissionaisPresentes={profissionaisPresentes}
                  afastamentosAtivosNoDia={afastamentosAtivosNoDia}
                  referenciasNivel3={referenciasNivel3}
                  referenciasNivel4={referenciasNivel4}
                  nivel4ByNivel3={nivel4ByNivel3}
                  servicosCalculados={servicosCalculados}
                  getWeekday={getWeekday}
                  readOnly={!access.canEditTab("diario")}
                  onSetDiaryTab={actions.setActiveDiaryTab}
                  onUpdateCabecalho={actions.updateCabecalho}
                  onTogglePresenca={actions.togglePresenca}
                  onUpdateAtividade={actions.updateAtividade}
                  onAddAtividade={actions.addAtividade}
                  onRemoveAtividade={actions.removeAtividade}
                  onToggleAtividadeAlocado={actions.toggleAtividadeAlocado}
                  onSelectBudgetNivel3ForAtividade={actions.selectBudgetNivel3ForAtividade}
                  onSelectBudgetForAtividade={actions.selectBudgetForAtividade}
                  onUpdateField={actions.updateField}
                />
              ) : null}

              {activeTab === "produtividade" ? (
                <ProductivitySection
                  servicosCalculados={servicosCalculados}
                  totalHH={totalHH}
                  servicosVinculados={servicosVinculados}
                  totalRealizadoEstimado={totalRealizadoEstimado}
                  producaoPorUnidade={producaoPorUnidade}
                  readOnly={!access.canEditTab("produtividade")}
                  onUpdateAtividade={actions.updateAtividade}
                  onExportExcel={actions.exportProdutividadeExcel}
                />
              ) : null}

              {activeTab === "gerencial" ? (
                <GerencialSection
                  data={data}
                  gerencialIndicadores={gerencialIndicadores}
                  resumoROS={resumoROS}
                  onCopyResumo={actions.copyResumoROS}
                  onUpdateGerencial={actions.updateGerencial}
                />
              ) : null}

              {activeTab === "dashboard" ? (
                <DashboardSection
                  dashboardFilters={dashboardFilters}
                  filtrosObra={filtrosObra}
                  filtrosFrente={filtrosFrente}
                  filtrosEquipe={filtrosEquipe}
                  dashboardResumo={dashboardResumo}
                  dashboardEvolucao={dashboardEvolucao}
                  dashboardServicos={dashboardServicos}
                  dashboardOrcamento={dashboardOrcamento}
                  visibleDashboardWidgets={access.currentAccess.dashboardWidgets}
                  onSetFilters={actions.setDashboardFilters}
                  onResetFilters={actions.resetDashboardFilters}
                />
              ) : null}

              {activeTab === "historico" ? (
                <HistorySection
                  historicoOrdenado={historicoOrdenado}
                  canDelete={access.canDeleteHistory}
                  readOnly={!access.canEditTab("historico")}
                  onSaveCurrent={actions.saveCurrentToHistory}
                  onLoad={actions.loadFromHistory}
                  onDelete={actions.deleteFromHistory}
                />
              ) : null}

              {activeTab === "orcamento" ? (
                <BudgetSection
                  orcamento={data.orcamento}
                  referenciasNivel4={referenciasNivel4}
                  totalOrcamento={totalOrcamento}
                  budgetSearch={budgetSearch}
                  budgetFiltered={budgetFiltered}
                  onSetBudgetSearch={actions.setBudgetSearch}
                  onRequestImport={() => fileInputRef.current?.click()}
                  onAddItem={actions.addItemOrcamento}
                  onUpdateOrcamento={actions.updateOrcamento}
                  onRemoveItem={actions.removeItemOrcamento}
                  onRemoveItems={actions.removeItensOrcamento}
                />
              ) : null}

              {activeTab === "administracao" ? (
                <AdministrationSection
                  data={data}
                  currentUser={access.currentUser}
                  currentAccess={access.currentAccess}
                  actualAccess={access.actualAccess}
                  accessProfiles={access.accessProfiles}
                  visibleTabs={access.visibleTabs}
                  isPreviewing={access.isPreviewing}
                  readOnly={!access.canEditTab("administracao")}
                  onSetUsuarioAtivo={actions.setUsuarioAtivo}
                  onAddUsuario={actions.addUsuario}
                  onUpdateUsuario={actions.updateUsuario}
                  onRemoveUsuario={actions.removeUsuario}
                  onAddPerfil={actions.addPerfilAcesso}
                  onUpdatePerfil={actions.updatePerfilAcesso}
                  onRemovePerfil={actions.removePerfilAcesso}
                  onSetVisualizarComoPerfil={actions.setVisualizarComoPerfil}
                />
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <PrintLayout
        data={data}
        obraAtiva={obraAtiva}
        funcionariosResumo={funcionariosResumo}
        totalPrevisto={totalPrevisto}
        totalPresentes={totalPresentes}
        totalHH={totalHH}
        totalQtd={totalQtd}
        totalRealizadoEstimado={totalRealizadoEstimado}
        servicosCalculados={servicosCalculados}
      />
    </>
  );
}
