class GlobalContext {
  commandLine: {
    data: string;
    record: string;
    leaguePath: string;
    experimentalConnector: boolean;
    localConnector: boolean;
    debug: boolean;
    ingestSecret: string;
  } = {
    data: '',
    record: '',
    leaguePath: '',
    experimentalConnector: false,
    localConnector: false,
    debug: false,
    ingestSecret: '',
  };
}

export default new GlobalContext();
