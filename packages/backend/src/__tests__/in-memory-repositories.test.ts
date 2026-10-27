import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { repositoryContract } from "./repository-contract.js";

repositoryContract("in-memory", async () => ({
  repositories: createInMemoryRepositories(),
  dispose: async () => {},
}));
