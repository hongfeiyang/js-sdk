import { ConnectionCreateData, IConnectionMetadata } from '@meeco/sdk';
import { Connection, Invitation } from '@meeco/vault-api-sdk';
import { CLIError } from '@oclif/errors';
import { AuthConfig } from './auth-config';
import { IYamlConfig } from './yaml-config';

interface IConnectionSpec {
  to: AuthConfig;
  from: AuthConfig;
}

export class ConnectionConfig {
  static kind = 'Connection';

  public readonly from: AuthConfig;
  public readonly to: AuthConfig;
  public readonly options: IConnectionMetadata;

  constructor(data: { to: AuthConfig; from: AuthConfig; options: IConnectionMetadata }) {
    this.from = data.from;
    this.to = data.to;
    this.options = data.options;
  }

  static fromYamlConfig(
    yamlConfigObj: IYamlConfig<IConnectionMetadata, IConnectionSpec>
  ): ConnectionConfig {
    if (yamlConfigObj.kind !== ConnectionConfig.kind) {
      throw new CLIError(
        `Config file of incorrect kind: '${yamlConfigObj.kind}' (expected '${ConnectionConfig.kind}')`
      );
    }

    return new ConnectionConfig({
      from: AuthConfig.fromMetadata(yamlConfigObj.spec.from),
      to: AuthConfig.fromMetadata(yamlConfigObj.spec.to),
      options: yamlConfigObj.metadata!,
    });
  }

  static encodeFromJson(payload: {
    invitation: Invitation;
    fromUserConnection: Connection;
    toUserConnection: Connection;
    options: IConnectionMetadata;
  }) {
    return {
      kind: ConnectionConfig.kind,
      spec: {
        invitation_id: payload.invitation.id,
        from_user_connection_id: payload.fromUserConnection.own.id,
        to_user_connection_id: payload.toUserConnection.own.id,
      },
      metadata: {
        ...payload.options,
      },
    };
  }

  static encodeFromUsers(
    from: AuthConfig,
    to: AuthConfig
  ): IYamlConfig<IConnectionMetadata, IConnectionSpec> {
    return {
      kind: ConnectionConfig.kind,
      metadata: {
        fromName: '',
        toName: '',
      },
      spec: {
        from,
        to,
      },
    };
  }

  public toConnectionCreateData(): ConnectionCreateData {
    return {
      from: this.from,
      to: this.to,
      options: this.options,
    };
  }
}
