import { useRef,useState } from "react";
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
import { useSession } from "@/hooks/useSession";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { WorkSelector } from "@/components/common/WorkSelector";
import { SaveStatus } from "@/components/common/SaveStatus";
import { ConflictDialog } from "@/components/common/ConflictDialog";
import { downloadJson } from "@/services/exports";
import { formatCurrency, formatNumber } from "@/utils/formatters";

function getSaveLabel(saveState) {
  const map = {
    idle: "Pronto",
    altered: "Alterado",
    sending: "Enviando",
    saved: "Salvo no servidor",
    failed: "Falha no envio",
    conflict: "Conflito",
  };
  return map[saveState] || "Pronto";
}

export default function App() {
  const session=useSession();
  return session.status==='authenticated'?<DiaryApplication key={session.user.id} session={session}/>:<AuthScreen session={session}/>;
}
function DiaryApplication({session}) {
  const [logoutDialog,setLogoutDialog]=useState(false),[logoutError,setLogoutError]=useState('');
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
    loading,error,budgetPreview,shared,selectedHistory,
  } = useDiaryApp(session);
  async function finishLogout(exportFirst=false) {
    try{
      if(exportFirst)downloadJson(shared.pendingExport(),'edicoes-pendentes.json');
      shared.clearForUser();await session.logout();
    }catch(error){setLogoutError(error.message);setLogoutDialog(false);shared.resume();}
  }
  function requestLogout() {
    shared.pause();
    if(shared.hasPending)setLogoutDialog(true);else finishLogout();
  }

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
                <button className="btn btn-secondary" onClick={requestLogout}>Sair</button>
              </div>

              <div>
                <h1 className="hero-title">Controle diario de obra com visao multiobra</h1>
                <p className="hero-text">
                  Diário, equipe e produtividade das obras em um só lugar.
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
                <button type="button" disabled={!session.user.isAdmin||loading} className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Importar planilhas
                </button>
                <button type="button" disabled={!access.canEditTab("diario")||loading} className="btn btn-secondary" onClick={actions.saveCurrentToHistory}>
                  Salvar dia no historico
                </button>
                <button type="button" disabled={!access.canEditTab("diario")||loading} className="btn btn-primary" onClick={actions.saveNow}>
                  Salvar no servidor
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
            <SaveStatus state={saveState} onRetry={actions.saveNow}/>
          </section>
          <WorkSelector obras={data.multiobra.obras.filter(o=>o.version)} obraId={data.multiobra.obraAtivaId} onChange={actions.selectObraAtiva} disabled={loading}/>
          {loading?<p role="status">Carregando dados…</p>:null}
          {error?<div role="alert" className="inline-note"><span>{error.message}</span><button className="btn btn-secondary" onClick={actions.reload}>Tentar novamente</button></div>:null}
          {shared.storageError?<p role="alert">{shared.storageError.message}</p>:null}
          {logoutError?<p role="alert">{logoutError}</p>:null}
          {shared.restoreAvailable?<Card title="Edição pendente neste navegador">
            <p>Existe uma edição desta conta para a obra e data selecionadas. Confira antes de restaurar.</p>
            <div className="button-row"><button className="btn btn-primary" onClick={shared.restorePending}>Restaurar edição pendente</button>
              <button className="btn btn-secondary" onClick={()=>downloadJson(shared.pendingExport(),'edicoes-pendentes.json')}>Exportar edição pendente</button>
              <button className="btn btn-danger" onClick={shared.discardPending}>Descartar edição pendente</button></div>
          </Card>:null}
          {budgetPreview?<Card title="Conferir importação de orçamento">
            <p>{budgetPreview.rows.length} itens · {budgetPreview.errors.length} inconsistências</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Referência</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>{budgetPreview.rows.slice(0,100).map((r,i)=><tr key={i}><td>{r.referencia}</td><td>{r.descricao}</td><td>{r.qtdeOrcada}</td><td>{r.unidade}</td></tr>)}</tbody></table></div>
            {budgetPreview.errors.slice(0,100).map((e,i)=><p role="alert" key={i}>Linha {e.row}: {e.message}</p>)}
            <button className="btn btn-primary" disabled={!!budgetPreview.errors.length} onClick={actions.confirmBudgetImport}>Confirmar importação</button>
            <button className="btn btn-secondary" onClick={actions.cancelBudgetImport}>Cancelar</button>
          </Card>:null}

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

            <fieldset className="tab-panel" disabled={loading||!!shared.restoreAvailable}>
              {activeTab === "multiobra" ? (
                <MultiobraSection
                  data={data}
                  obraAtiva={obraAtiva}
                  indicadoresObraAtiva={indicadoresObraAtiva}
                  backendEnabled={backendEnabled}
                  syncState={syncState}
                  onSelectObra={actions.selectObraAtiva}
                  onAddObra={actions.addObra}
                  onUpdateObra={actions.updateObra}
                  onSaveObra={actions.saveObra}
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
                  onSaveProfissional={actions.saveProfissional}
                  onRemoveProfissional={actions.removeProfissional}
                  onAddAfastamento={actions.addAfastamento}
                  onUpdateAfastamento={actions.updateAfastamento}
                  onSaveAfastamento={actions.saveAfastamento}
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
                  readOnly={!access.canEditTab("gerencial")}
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
                  canRegister={access.canEditTab("diario")}
                  onLoad={actions.loadFromHistory}
                  onDelete={actions.deleteFromHistory}
                  selectedDiary={selectedHistory}
                  obras={data.multiobra.obras}
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
                  onSaveItem={actions.saveItemOrcamento}
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
                  onInviteUser={actions.inviteUser}
                  onUpdateMemberships={actions.updateMemberships}
                  onDeactivateUser={actions.deactivateUser}
                  onUpdateProfile={actions.updateProfile}
                />
              ) : null}
            </fieldset>
          </Card>
        </div>
      </div>

      <ConflictDialog conflict={shared.conflict} local={shared.payload} onReapply={shared.reapply} onDiscard={shared.useRemote} canRestore={access.canDeleteHistory}/>
      {logoutDialog?<div className="dialog-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-label="Edições pendentes ao sair">
        <h2>Edições pendentes</h2><p>Há conteúdo ainda não confirmado no servidor. Você pode exportar uma cópia antes de sair.</p>
        <div className="button-row"><button className="btn btn-primary" onClick={()=>finishLogout(true)}>Exportar e sair</button>
          <button className="btn btn-danger" onClick={()=>finishLogout(false)}>Descartar e sair</button>
          <button className="btn btn-secondary" onClick={()=>{setLogoutDialog(false);shared.resume();}}>Continuar editando</button></div>
      </section></div>:null}
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
