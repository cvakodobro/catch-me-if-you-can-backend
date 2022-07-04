const { server } = require("./server");
require("./real-time");

const PORT = process.env.PORT || 5001;
console.log(PORT)
server.listen(PORT, () => {
  console.log(`listening on port :${PORT}`);
});
