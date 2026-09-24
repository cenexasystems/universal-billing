import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// A custom tagged template function that mimics Neon's `sql` but uses `pg.Pool` internally.
// This allows both `sql\`` tagged templates and `sql.unsafe` calls to work seamlessly.
const sql = async (strings, ...values) => {
  let query = '';
  for (let i = 0; i < strings.length; i++) {
    query += strings[i];
    if (i < values.length) {
      query += `$${i + 1}`;
    }
  }
  const { rows } = await pool.query(query, values);
  return rows;
};

sql.unsafe = async (queryStr, values = []) => {
  const { rows } = await pool.query(queryStr, values);
  return rows;
};

export default sql;