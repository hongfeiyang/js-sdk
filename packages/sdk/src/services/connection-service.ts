import { Connection } from '@meeco/vault-api-sdk';
import { AuthData } from '../models/auth-data';
import { ConnectionCreateData } from '../models/connection-create-data';
import { Environment } from '../models/environment';
import cryppo from '../services/cryppo-service';
import {
  KeystoreAPIFactory,
  keystoreAPIFactory,
  VaultAPIFactory,
  vaultAPIFactory
} from '../util/api-factory';
import { findConnectionBetween } from '../util/find-connection-between';

/**
 * Used for setting up connections between Meeco `User`s to allow the secure sharing of data (see also {@link ShareService})
 */
export class ConnectionService {
  private cryppo = (<any>global).cryppo || cryppo;
  private vaultApiFactory: VaultAPIFactory;
  private keystoreApiFactory: KeystoreAPIFactory;
  constructor(private environment: Environment, private log: (message: string) => void = () => {}) {
    this.vaultApiFactory = vaultAPIFactory(environment);
    this.keystoreApiFactory = keystoreAPIFactory(environment);
  }

  public async createInvitation(name: string, auth: AuthData) {
    this.log('Generating key pair');
    const keyPair = await this.createAndStoreKeyPair(auth);

    this.log('Encrypting recipient name');
    const encryptedName: string = await this.encryptRecipientName(name, auth);

    this.log('Sending invitation request');
    return await this.vaultApiFactory(auth)
      .InvitationApi.invitationsPost({
        public_key: {
          keypair_external_id: keyPair.keystoreStoredKeyPair.id,
          public_key: keyPair.keyPair.publicKey
        },
        invitation: {
          encrypted_recipient_name: encryptedName
        }
      })
      .then(result => result.invitation);
  }

  public async acceptInvitation(name: string, invitationToken: string, auth: AuthData) {
    this.log('Generating key pair');
    const keyPair = await this.createAndStoreKeyPair(auth);

    this.log('Encrypting connection name');
    const encryptedName: string = await this.encryptRecipientName(name, auth);

    this.log('Accepting invitation');
    return await this.vaultApiFactory(auth)
      .ConnectionApi.connectionsPost({
        public_key: {
          keypair_external_id: keyPair.keystoreStoredKeyPair.id,
          public_key: keyPair.keyPair.publicKey
        },
        connection: {
          encrypted_recipient_name: encryptedName,
          invitation_token: invitationToken
        }
      })
      .then(res => res.connection);
  }

  /**
   * Note this only works if we have authentication data for both connecting users.
   * For more typical use cases you should manually call {@link createInvitation}
   * as one user and {@link acceptInvitation} as the other user.
   */
  public async createConnection(config: ConnectionCreateData) {
    const { to, from, options } = config;

    let existingConnection: { fromUserConnection: Connection; toUserConnection: Connection };
    try {
      // We want to avoid creating keypairs etc. only to find out that the users were connected from the beginning
      this.log('Checking for an existing connection');
      existingConnection = await findConnectionBetween(from, to, this.environment, this.log);
    } catch (err) {
      // Empty catch because getting 404's is expected if the connection does not exist
    }

    // @ts-ignore
    if (existingConnection?.fromUserConnection && existingConnection?.toUserConnection) {
      throw new Error('Connection exists between the specified users');
    }

    const invitation = await this.createInvitation(options.toName, from);
    await this.acceptInvitation(options.fromName, invitation.token, to);

    // Now the connection has been created we need to re-fetch the original user's connection.
    // We might as well fetch both to ensure it's connected both ways correctly.

    const { fromUserConnection, toUserConnection } = await findConnectionBetween(
      from,
      to,
      this.environment,
      this.log
    );

    return {
      invitation,
      fromUserConnection,
      toUserConnection,
      options
    };
  }

  public async listConnections(user: AuthData) {
    this.log('Fetching connections');
    const result = await this.vaultApiFactory(user).ConnectionApi.connectionsGet();
    this.log('Decrypting connection names');
    const decryptions = (result.connections || []).map(connection =>
      this.cryppo
        .decryptWithKey({
          serialized: connection.encrypted_recipient_name!,
          key: user.data_encryption_key.key
        })
        .then(name => ({
          name,
          connection
        }))
    );
    return Promise.all(decryptions);
  }

  private encryptRecipientName(name: string, user: AuthData) {
    return this.cryppo
      .encryptWithKey({
        data: name,
        key: user.data_encryption_key.key,
        strategy: this.cryppo.CipherStrategy.AES_GCM
      })
      .then(result => result.serialized);
  }

  private async createAndStoreKeyPair(user: AuthData) {
    const keyPair = await this.cryppo.generateRSAKeyPair();

    const toPrivateKeyEncrypted = await this.cryppo.encryptWithKey({
      data: keyPair.privateKey,
      key: user.key_encryption_key.key,
      strategy: this.cryppo.CipherStrategy.AES_GCM
    });

    const keystoreStoredKeyPair = await this.keystoreApiFactory(user)
      .KeypairApi.keypairsPost({
        public_key: keyPair.publicKey,
        encrypted_serialized_key: toPrivateKeyEncrypted.serialized,
        // API will 500 without
        metadata: {},
        external_identifiers: []
      })
      .then(result => result.keypair);

    return {
      keyPair,
      keystoreStoredKeyPair
    };
  }
}
