const http = require("http");

async function testFetch() {
  console.log("Testing GET /api/admin/spoc-allowlist locally...");
  http.get("http://localhost:3000/api/admin/spoc-allowlist", (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("Status Code:", res.statusCode);
      console.log("Response Body:", data);
    });
  }).on("error", (err) => {
    console.error("HTTP Error:", err.message);
  });
}

testFetch();
