// Opt-in for machines with limited RAM. Keeps test isolation and all assertions.
export default { test: { maxWorkers: 1, fileParallelism: false } };
