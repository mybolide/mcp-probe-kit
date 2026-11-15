#!/usr/bin/env node
import { main } from "../src/cli.js";

const code = await main(process.argv.slice(2));
process.exit(typeof code === "number" ? code : 0);