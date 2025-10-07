import debugModule from "debug";

const log = {
  trace: debugModule("driver:trace"),
  debug: debugModule("driver:debug"),
  info: debugModule("driver:info"),
  warn: debugModule("driver:warn"),
  error: debugModule("driver:error")
};

export default log;
