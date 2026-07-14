import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { DASHBOARD_WIDGETS, TAB_ITEMS } from "@/data/defaults";

function toggleValue(list = [], value, checked) {
  if (checked) return Array.from(new Set([...list, value]));
  return list.filter((item) => item !== value);
}

function labelsForTabs(values = []) {
  return TAB_ITEMS.filter((item) => values.includes(item.value)).map((item) => item.label).join(", ");
}

export function AdministrationSection({
  data,
  currentUser,
  currentAccess,
  actualAccess,
  accessProfiles,
  visibleTabs,
  isPreviewing,
  readOnly,
  onSetUsuarioAtivo,
  onAddUsuario,
  onUpdateUsuario,
  onRemoveUsuario,
  onAddPerfil,
  onUpdatePerfil,
  onRemovePerfil,
  onSetVisualizarComoPerfil,
}) {
  const usuarios = data.administracao?.usuarios || [];
  const perfis = accessProfiles || [];
  const perfisById = new Map(perfis.map((perfil) => [perfil.id, perfil]));
  const previewPerfil = data.administracao?.visualizarComoPerfil || "";

  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-4">
        <StatCard label="Logins" value={usuarios.length} />
        <StatCard label="Funcao ativa" value={currentAccess.label || currentUser.perfil} />
        <StatCard label="Abas liberadas" value={visibleTabs.length} />
        <StatCard label="Modo" value={isPreviewing ? "Visualizacao" : "Real"} />
      </div>

      <Card title="Sessao atual" subtitle="Troque o login ativo ou simule uma funcao sem retirar o acesso administrativo real.">
        <div className="form-grid form-grid-2">
          <Field label="Login ativo">
            <select value={data.administracao?.usuarioAtivoId || ""} onChange={(event) => onSetUsuarioAtivo(event.target.value)}>
              {usuarios.map((usuario) => {
                const profile = perfisById.get(usuario.perfil);
                return (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome || usuario.login || "Sem nome"} - {profile?.label || usuario.perfil}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Visualizar como">
            <select
              disabled={!actualAccess?.isAdmin}
              value={previewPerfil}
              onChange={(event) => onSetVisualizarComoPerfil(event.target.value)}
            >
              <option value="">Administrativo real</option>
              {perfis.map((perfil) => (
                <option key={perfil.id} value={perfil.id}>
                  {perfil.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {readOnly ? <div className="inline-note"><strong>Somente leitura</strong><span>Seu perfil pode consultar Logins, mas nao alterar usuarios ou permissoes.</span></div> : null}

      <Card
        title="Logins"
        subtitle="Crie usuarios e vincule cada um a uma funcao de acesso."
        actions={<button type="button" disabled={readOnly} className="btn btn-secondary" onClick={onAddUsuario}>Adicionar login</button>}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Cargo</th>
                <th>Funcao de acesso</th>
                <th>Ativo</th>
                <th>Abas visiveis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => {
                const profile = perfisById.get(usuario.perfil) || perfis[0];
                const lockedAdmin = profile?.isAdmin && (usuario.id === "user-gerencia" || usuario.id === currentUser.id);
                return (
                  <tr key={usuario.id}>
                    <td><input disabled={readOnly} value={usuario.nome} onChange={(event) => onUpdateUsuario(usuario.id, "nome", event.target.value)} /></td>
                    <td><input disabled={readOnly} value={usuario.login} onChange={(event) => onUpdateUsuario(usuario.id, "login", event.target.value)} /></td>
                    <td><input disabled={readOnly} value={usuario.cargo} onChange={(event) => onUpdateUsuario(usuario.id, "cargo", event.target.value)} /></td>
                    <td>
                      <select disabled={readOnly || lockedAdmin} value={usuario.perfil} onChange={(event) => onUpdateUsuario(usuario.id, "perfil", event.target.value)}>
                        {perfis.map((perfil) => (
                          <option key={perfil.id} value={perfil.id}>{perfil.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select disabled={readOnly || lockedAdmin} value={usuario.ativo ? "sim" : "nao"} onChange={(event) => onUpdateUsuario(usuario.id, "ativo", event.target.value === "sim")}>
                        <option value="sim">Sim</option>
                        <option value="nao">Nao</option>
                      </select>
                    </td>
                    <td className="cell-muted">{labelsForTabs(profile?.tabs || []) || "-"}</td>
                    <td className="actions-cell">
                      <button type="button" className="btn btn-ghost" onClick={() => onSetUsuarioAtivo(usuario.id)}>Usar</button>
                      <button type="button" disabled={readOnly || lockedAdmin || usuarios.length <= 1} className="btn btn-danger" onClick={() => onRemoveUsuario(usuario.id)}>Excluir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Permissoes por funcao"
        subtitle="Configure o que cada funcao pode ver, editar e quais blocos do dashboard aparecem."
        actions={<button type="button" disabled={readOnly} className="btn btn-secondary" onClick={onAddPerfil}>Adicionar funcao</button>}
      >
        <div className="permission-list">
          {perfis.map((perfil) => (
            <div key={perfil.id} className="permission-panel">
              <div className="permission-head">
                <Field label="Nome da funcao">
                  <input disabled={readOnly || perfil.isAdmin} value={perfil.label} onChange={(event) => onUpdatePerfil(perfil.id, "label", event.target.value)} />
                </Field>
                <div className="permission-actions">
                  <span className="status-chip">{perfil.isAdmin ? "Administrativo travado" : "Configuravel"}</span>
                  <button type="button" disabled={readOnly || perfil.isAdmin} className="btn btn-danger" onClick={() => onRemovePerfil(perfil.id)}>Excluir funcao</button>
                </div>
              </div>

              <div className="permission-matrix">
                {TAB_ITEMS.map((tab) => {
                  const canView = perfil.tabs.includes(tab.value);
                  const canEdit = perfil.editableTabs.includes(tab.value);
                  return (
                    <div key={tab.value} className="permission-row">
                      <strong>{tab.label}</strong>
                      <label>
                        <input
                          disabled={readOnly || perfil.isAdmin}
                          type="checkbox"
                          checked={canView}
                          onChange={(event) => onUpdatePerfil(perfil.id, "tabs", toggleValue(perfil.tabs, tab.value, event.target.checked))}
                        />
                        <span>Ver</span>
                      </label>
                      <label>
                        <input
                          disabled={readOnly || perfil.isAdmin || !canView}
                          type="checkbox"
                          checked={canEdit}
                          onChange={(event) => onUpdatePerfil(perfil.id, "editableTabs", toggleValue(perfil.editableTabs, tab.value, event.target.checked))}
                        />
                        <span>Editar</span>
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="permission-dashboard">
                <strong>Dashboard por funcao</strong>
                <div className="check-grid check-grid-compact">
                  {DASHBOARD_WIDGETS.map((widget) => (
                    <label key={widget.value} className="check-card">
                      <input
                        disabled={readOnly || perfil.isAdmin || !perfil.tabs.includes("dashboard")}
                        type="checkbox"
                        checked={perfil.dashboardWidgets.includes(widget.value)}
                        onChange={(event) =>
                          onUpdatePerfil(perfil.id, "dashboardWidgets", toggleValue(perfil.dashboardWidgets, widget.value, event.target.checked))
                        }
                      />
                      <strong>{widget.label}</strong>
                    </label>
                  ))}
                </div>
              </div>

              <label className="permission-delete-history">
                <input
                  disabled={readOnly || perfil.isAdmin}
                  type="checkbox"
                  checked={perfil.canDeleteHistory}
                  onChange={(event) => onUpdatePerfil(perfil.id, "canDeleteHistory", event.target.checked)}
                />
                <span>Pode excluir registros do historico</span>
              </label>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
