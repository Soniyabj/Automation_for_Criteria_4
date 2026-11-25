import React, { useEffect, useState } from "react";
import { batches } from "../services/api";

function BatchTable() {
  const [data, setData] = useState([]);

  useEffect(() => {
    batches.getAll().then((res) => setData(res.data));
  }, []);

  return (
    <div>
      <h2>Batch List</h2>
      <ul>
        {data.map((batch) => (
          <li key={batch.id}>{batch.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default BatchTable;
