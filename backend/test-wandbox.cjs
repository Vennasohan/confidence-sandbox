const axios = require('axios');

async function testWandbox() {
  try {
    const res = await axios.post('https://wandbox.org/api/compile.json', {
      compiler: "cpython-3.10.4",
      code: "import sys\nprint(sys.stdin.read().strip())",
      stdin: "123"
    });
    console.log(res.data);
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
testWandbox();
