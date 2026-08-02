"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightLeft, Building2, FolderKanban, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UserRoundCog, X } from "lucide-react";
import { SectionHead } from "@/components/dashboard/common";
import type { DashboardData, DashboardMutate, DashboardSubmit } from "@/components/dashboard/types";

type Project = DashboardData["context"]["projects"][number];

export function WorkspaceView({ data, busy, submit, mutate, switchOrganization, switchProject }: { data: DashboardData; busy: string; submit: DashboardSubmit; mutate: DashboardMutate; switchOrganization: (id: string) => Promise<void>; switchProject: (id: string) => Promise<void> }) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const role = data.context.organization.role;
  const canAdminister = ["owner", "admin"].includes(role);
  const isOwner = role === "owner";
  const otherMembers = data.members.filter((member) => member.id !== data.context.user.id);

  async function renameWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "");
    await mutate(`/api/workspaces/${data.context.organization.id}`, { action: "rename", name }, "PATCH");
  }
  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userId = String(new FormData(event.currentTarget).get("userId") || "");
    const member = data.members.find((item) => item.id === userId);
    if (!member || !window.confirm(`Transfer ownership of ${data.context.organization.name} to ${member.name}? Your role will become Admin.`)) return;
    await mutate(`/api/workspaces/${data.context.organization.id}`, { action: "transfer", userId }, "PATCH");
  }
  async function leaveWorkspace() {
    if (!window.confirm(`Leave ${data.context.organization.name}? You will immediately lose access.`)) return;
    await mutate(`/api/workspaces/${data.context.organization.id}?mode=leave`, undefined, "DELETE");
  }
  async function deleteWorkspace() {
    if (!window.confirm(`Permanently delete ${data.context.organization.name} and all of its projects, endpoints, API keys, and delivery history? This cannot be undone.`)) return;
    await mutate(`/api/workspaces/${data.context.organization.id}?mode=delete`, undefined, "DELETE");
  }
  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete ${project.name} and all data inside it? This cannot be undone.`)) return;
    await mutate(`/api/projects/${project.id}`, undefined, "DELETE");
  }

  return <>
    <SectionHead eyebrow="Account structure" heading="Workspace settings" copy="Manage company access and keep development, staging, and production resources isolated by project." />
    <section className="workspace-summary-grid">
      <article><span className="resource-icon"><Building2 size={18} /></span><div><small>Active workspace</small><strong>{data.context.organization.name}</strong><code>{data.context.organization.slug}</code></div><i className="role-pill">{role}</i></article>
      <article><span className="resource-icon"><FolderKanban size={18} /></span><div><small>Active project</small><strong>{data.context.project.name}</strong><code>{data.context.project.environment}</code></div><i className="status-dot on" /></article>
    </section>
    <section className="workspace-management-grid">
      <form className="content-card form-card" onSubmit={(event) => submit(event, "/api/workspaces", (form) => ({ name: form.get("name") }))}><span className="resource-icon"><Building2 size={18} /></span><h3>Create workspace</h3><p className="form-copy">A new workspace starts with its own Production project and isolated resources.</p><label>Workspace name<input name="name" required placeholder="Acme Platform" /></label><button className="button primary" disabled={busy === "/api/workspaces"}>{busy === "/api/workspaces" ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create workspace</button></form>
      <section className="content-card list-card"><div className="card-head"><div><span className="section-label">Memberships</span><h3>Your workspaces</h3></div><span>{data.context.organizations.length}</span></div><div className="workspace-list">{data.context.organizations.map((workspace) => <article key={workspace.id} className={workspace.id === data.context.organization.id ? "active" : ""}><span className="workspace-avatar light">{workspace.name.slice(0, 1).toUpperCase()}</span><div><strong>{workspace.name}</strong><small>{workspace.role}</small></div>{workspace.id === data.context.organization.id ? <span>Current</span> : <button className="button secondary small" onClick={() => void switchOrganization(workspace.id)}><ArrowRightLeft size={13} /> Switch</button>}</article>)}</div></section>
    </section>

    <section className="content-card project-manager"><div className="card-head"><div><span className="section-label">Environment isolation</span><h3>Projects</h3></div><span>{data.context.projects.length}</span></div>{canAdminister ? <form className="project-create" onSubmit={(event) => submit(event, "/api/projects", (form) => ({ name: form.get("name"), environment: form.get("environment") }))}><label>Project name<input name="name" required placeholder="Checkout staging" /></label><label>Environment<select name="environment" defaultValue="development"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label><button className="button primary" disabled={busy === "/api/projects"}><Plus size={15} /> Create project</button></form> : null}<div className="project-list">{data.context.projects.map((project) => <article key={project.id} className={project.id === data.context.project.id ? "active" : ""}><span className="resource-icon"><FolderKanban size={17} /></span><div><strong>{project.name}</strong><small>{project.environment} · {project.slug}</small></div><span className={`environment-tag ${project.environment}`}>{project.environment}</span><div className="project-actions">{project.id !== data.context.project.id ? <button className="button secondary small" onClick={() => void switchProject(project.id)}>Open</button> : <span>Active</span>}{canAdminister ? <button className="icon-button" onClick={() => setEditingProject(project)} title="Edit project"><Pencil size={14} /></button> : null}{canAdminister && data.context.projects.length > 1 ? <button className="icon-button danger-icon" onClick={() => void deleteProject(project)} title="Delete project"><Trash2 size={14} /></button> : null}</div></article>)}</div></section>

    {canAdminister ? <section className="content-card workspace-admin"><div className="card-head"><div><span className="section-label">Workspace administration</span><h3>Identity and ownership</h3></div><ShieldCheck size={18} /></div><div className="workspace-admin-grid"><form onSubmit={renameWorkspace}><label>Workspace name<input name="name" required defaultValue={data.context.organization.name} /></label><button className="button secondary"><Pencil size={14} /> Rename workspace</button></form>{isOwner ? <form onSubmit={transferOwnership}><label>Transfer ownership<select name="userId" required defaultValue=""><option value="" disabled>Select a member</option>{otherMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label><button className="button secondary" disabled={!otherMembers.length}><UserRoundCog size={14} /> Transfer</button></form> : null}</div></section> : null}

    <section className="workspace-danger"><div><strong>{isOwner ? "Delete workspace" : "Leave workspace"}</strong><p>{isOwner ? "Deletion permanently removes every project and delivery record." : "Leaving removes your membership without affecting other members."}</p></div><button className="button danger" disabled={data.context.organizations.length <= 1} onClick={() => void (isOwner ? deleteWorkspace() : leaveWorkspace())}><Trash2 size={15} /> {isOwner ? "Delete workspace" : "Leave workspace"}</button>{data.context.organizations.length <= 1 ? <small>Create or join another workspace before using this action.</small> : null}</section>
    {editingProject ? <ProjectEditor project={editingProject} mutate={mutate} close={() => setEditingProject(null)} /> : null}
  </>;
}

function ProjectEditor({ project, mutate, close }: { project: Project; mutate: DashboardMutate; close: () => void }) {
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    const result = await mutate(`/api/projects/${project.id}`, { name: form.get("name"), environment: form.get("environment") }, "PATCH");
    setSaving(false); if (result) close();
  }
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="endpoint-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-label">Project settings</span><h2>{project.name}</h2><p>{project.slug}</p></div><button className="icon-button" onClick={close} aria-label="Close project settings"><X size={19} /></button></header><form onSubmit={save}><label>Project name<input name="name" required defaultValue={project.name} /></label><label>Environment<select name="environment" defaultValue={project.environment}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Pencil size={15} />} Save project</button></form></aside></div>;
}