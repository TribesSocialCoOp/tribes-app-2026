const { db } = require('./src/db');
const { getTribes } = require('./src/lib/data-access/tribes');

async function test() {
  try {
    const tribes = await getTribes();
    console.log("Tribes loaded successfully:", tribes.length);
  } catch (e) {
    console.error("Error loading tribes:", e);
  }
}

test();
