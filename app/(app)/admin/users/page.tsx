"use client";
import { TEAMS, USERS, userById } from "@/lib/mock";
import { ROLE_LABEL } from "@/lib/permissions";
import { PageHeader, useToast } from "@/components/ui";

export default function Users() {
  const toast = useToast();
  return (
    <>
      <PageHeader title="Users" sub="Invite-only. MFA required for Admin and Manager." actions={<button className="btn btn-primary" onClick={() => toast("User invites arrive in Phase 1", "err")}>Invite user</button>} />
      <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Reports to</th><th>Status</th><th>MFA</th></tr></thead>
        <tbody>{USERS.map((u) => <tr key={u.id}><td>{u.name}</td><td className="text-muted">{u.email}</td><td>{ROLE_LABEL[u.role]}</td><td>{TEAMS.find((t) => t.id === u.teamId)?.name}</td><td>{u.id === u.managerId ? "—" : userById(u.managerId)?.name}</td>
          <td><span className="st" data-tone={u.status === "active" ? "success" : "neutral"}><i />{u.status === "active" ? "Active" : "Deactivated"}</span></td><td>{u.role === "rep" ? <span className="text-faint">Optional</span> : "Enrolled"}</td></tr>)}</tbody></table></div>
    </>
  );
}
