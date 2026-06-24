import { Table, Status } from "../shared/index.jsx";

export default function Secrets() {
  const rows = [
    ["apigee-client", "Secrets Manager", "Project", "30 days", "Active"],
    ["kb-reader", "Secrets Manager", "Agent", "60 days", "Active"],
  ];
  return (
    <section className="panel">
      <h2>Secret References</h2>
      <Table headers={["Name", "Provider", "Scope", "Rotation", "Status"]}>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) => <td key={i}>{i === 4 ? <Status>{cell}</Status> : cell}</td>)}
          </tr>
        ))}
      </Table>
    </section>
  );
}
