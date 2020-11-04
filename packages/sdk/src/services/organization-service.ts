import {
  Organization,
  OrganizationsManagingOrganizationsApi,
  Service as APIService,
} from '@meeco/vault-api-sdk';
import { getAllPaged, reducePages } from '../util/paged';
import Service, { IVaultToken } from './service';

/**
 * Manage organizations from the API.
 */
export class OrganizationService extends Service<OrganizationsManagingOrganizationsApi> {
  public getAPI(token: IVaultToken) {
    return this.vaultAPIFactory(token.vault_access_token).OrganizationsManagingOrganizationsApi;
  }

  /**
   * Login as an Organization member, getting the Organization's vault session token.
   * @param credentials Organization member's vault token
   * @param privateKey Used to decrypt the stored token
   */
  public async getOrganizationToken(
    credentials: IVaultToken,
    organizationId: string,
    privateKey: string
  ): Promise<IVaultToken> {
    const result = await this.vaultAPIFactory(
      credentials.vault_access_token
    ).OrganizationsManagingOrganizationsApi.organizationsIdLoginPost(organizationId);

    const decryptedVaultSessionToken = await Service.cryppo.decryptSerializedWithPrivateKey({
      privateKeyPem: privateKey,
      serialized: result.encrypted_access_token,
    });

    return { vault_access_token: decryptedVaultSessionToken };
  }

  /**
   * Request creation of an Organization. The Organization has a key pair that is used to
   * encrypt session tokens, so only members with the private key can login on behalf of the
   * Organization. This is `privateKey` in the result; it must be stored securely, if lost
   * you cannot log in to the Organization.
   */
  public async create(
    credentials: IVaultToken,
    name: string,
    info: Partial<{ description: string; url: string; email: string }> = {}
  ) {
    const rsaKeyPair = await Service.cryppo.generateRSAKeyPair(4096);
    const public_key = rsaKeyPair.publicKey;

    // must have name and public_key
    // notice that public_key is used to encrypt the session token of the org
    const result = await this.vaultAPIFactory(
      credentials.vault_access_token
    ).OrganizationsManagingOrganizationsApi.organizationsPost({
      name,
      public_key,
      ...info,
    });

    return {
      organization: result.organization,
      privateKey: rsaKeyPair.privateKey,
      publicKey: rsaKeyPair.publicKey,
    };
  }

  /**
   * @param mode If unspecified returns all validated organizations; `requested` by user, or user `member` orgs can be given too.
   */
  public async listAll(
    credentials: IVaultToken,
    mode?: 'requested' | 'member'
  ): Promise<{ organizations: Organization[]; services: APIService[] }> {
    const api = this.vaultAPIFactory(credentials.vault_access_token).OrganizationsForVaultUsersApi;

    return getAllPaged(cursor => api.organizationsGet(mode, cursor))
      .then(reducePages)
      .then(({ organizations, services }) => ({
        organizations,
        services,
      }));
  }
}

export enum OrganizationMemberRoles {
  Admin = 'admin',
  Owner = 'owner',
}
