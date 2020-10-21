import { ConnectionService } from '@meeco/sdk';
import { AuthConfig } from '../../configs/auth-config';
import authFlags from '../../flags/auth-flags';
import pageFlags from '../../flags/page-flags';
import MeecoCommand from '../../util/meeco-command';

export default class ConnectionsList extends MeecoCommand {
  static description = 'List connections for an authenticated user';

  static flags = {
    ...MeecoCommand.flags,
    ...authFlags,
    ...pageFlags,
  };

  async run() {
    const { flags } = this.parse(ConnectionsList);
    const { auth, all } = flags;
    try {
      const environment = await this.readEnvironmentFile();
      const authConfig = await this.readConfigFromFile(AuthConfig, auth);

      if (!authConfig) {
        this.error('Must specify authentication file');
      }

      const service = new ConnectionService(environment, {
        error: this.error,
        warn: this.warn,
        log: this.updateStatus,
      });

      const result = all ? await service.listAll(authConfig) : await service.list(authConfig);

      this.printYaml(result);
    } catch (err) {
      await this.handleException(err);
    }
  }
}
