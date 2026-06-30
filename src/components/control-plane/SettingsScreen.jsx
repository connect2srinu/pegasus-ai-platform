import { Table } from "../shared/index.jsx";
import { fallback } from "../../constants.js";

export default function SettingsScreen({ project }) {
  const projectName = typeof project === "object" ? project?.name : project;
  const data = fallback[projectName] || fallback[Object.keys(fallback)[0]] || { users: [] };
  return (
    <div className="grid cols-2">
      <section className="panel">
        <h2>Users and Roles</h2>
        <Table headers={["User", "Role", "Last Active"]}>
          {(data.users || []).map((row) => (
            <tr key={row[0]}>
              <td>{row[0]}</td>
              <td><span className="pill">{row[1]}</span></td>
              <td>{row[2]}</td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="panel">
        <h2>Policy Defaults</h2>
        <div className="form-grid">
          <label className="field full">Runtime targets<select><option>AgentCore only</option></select></label>
          <label className="field full">Long-term memory<select><option>Requires owner approval</option></select></label>
          <label className="field full">Critical tools<select><option>Platform admin approval required</option></select></label>
        </div>
      </section>
    </div>
  );
}
