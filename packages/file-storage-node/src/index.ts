import { binaryBufferToString, generateRandomKey } from '@meeco/cryppo';
import {
  AzureBlockDownload,
  buildApiConfig,
  directAttachmentAttach,
  directAttachmentUpload,
  directAttachmentUploadUrl,
  downloadAttachment,
  downloadThumbnailCommon,
  encryptAndUploadThumbnailCommon,
  getDirectAttachmentInfo,
  IFileStorageAuthConfiguration,
  ThumbnailType,
} from '@meeco/file-storage-common';
import { DirectAttachmentsApi } from '@meeco/vault-api-sdk';
import * as fs from 'fs';
import * as mfe from 'mime-file-extension';
import nodeFetch from 'node-fetch';
import * as path from 'path';
import * as FileUtils from './FileUtils.node';

export { ThumbnailType, ThumbnailTypes, thumbSizeTypeToMimeExt } from '@meeco/file-storage-common';

export async function largeFileUploadNode(
  filePath,
  environment: {
    vault: {
      url: string;
    };
  },
  authConfig: IFileStorageAuthConfiguration
): Promise<{ attachment: any; dek: string }> {
  const fileStats = fs.statSync(filePath);
  let fileType: string;
  const fileName = path.basename(filePath);

  try {
    fileType = mfe.getMimeType(path.extname(filePath));
  } catch {
    // when file type is unknown, default it to 'text/plain'
    fileType = 'text/plain';
  }

  const uploadUrl = await directAttachmentUploadUrl(
    {
      fileSize: fileStats.size,
      fileType: fileType ? fileType : '',
      fileName,
    },
    authConfig,
    environment.vault.url,
    nodeFetch
  );
  const dek = generateRandomKey();
  const uploadResult = await directAttachmentUpload(
    {
      directUploadUrl: uploadUrl.attachment_direct_upload_url.url,
      file: filePath,
      encrypt: true,
      attachmentDek: dek,
    },
    FileUtils
  );

  const artifactsFileName = fileName + '.encryption_artifacts';
  const artifactsFileDir = `./${artifactsFileName}`;
  fs.writeFileSync(artifactsFileDir, JSON.stringify(uploadResult.artifacts));
  const artifactsFileStats = fs.statSync(artifactsFileDir);

  const artifactsUploadUrl = await directAttachmentUploadUrl(
    {
      fileName: artifactsFileName,
      fileType: 'application/json',
      fileSize: artifactsFileStats.size,
    },
    authConfig,
    environment.vault.url,
    nodeFetch
  );

  await directAttachmentUpload(
    {
      directUploadUrl: artifactsUploadUrl.attachment_direct_upload_url.url,
      file: artifactsFileDir,
      encrypt: false,
    },
    FileUtils
  );

  const attachedDoc = await directAttachmentAttach(
    {
      blobId: uploadUrl.attachment_direct_upload_url.blob_id,
      blobKey: uploadUrl.attachment_direct_upload_url.blob_key,
      artifactsBlobId: artifactsUploadUrl.attachment_direct_upload_url.blob_id,
      artifactsBlobKey: artifactsUploadUrl.attachment_direct_upload_url.blob_key,
    },
    authConfig,
    environment.vault.url,
    nodeFetch
  );

  return { attachment: attachedDoc.attachment, dek };
}

export async function fileDownloadNode(
  attachmentId: string,
  environment: {
    vault: {
      url: string;
    };
  },
  authConfig: IFileStorageAuthConfiguration,
  attachmentDek?: string,
  logFunction?: any
): Promise<{ fileName: string; buffer: Buffer }> {
  const attachmentInfo = await getDirectAttachmentInfo(
    { attachmentId },
    authConfig,
    environment.vault.url,
    nodeFetch
  );
  let buffer: Buffer;
  const fileName: string = attachmentInfo.attachment.filename;
  if (attachmentInfo.attachment.is_direct_upload) {
    // was uploaded in chunks
    const downloaded = await largeFileDownloadNode(
      attachmentId,
      attachmentDek,
      authConfig,
      environment.vault.url
    );
    buffer = downloaded.byteArray;
  } else {
    const downloaded = await downloadAttachment(attachmentId, authConfig, environment.vault.url);
    buffer = Buffer.from(downloaded as string);
  }
  return { fileName, buffer };
}

export async function largeFileDownloadNode(
  attachmentID,
  dek,
  authConfig: IFileStorageAuthConfiguration,
  vaultUrl
) {
  const direct_download_encrypted_artifact = await getDirectDownloadInfo(
    attachmentID,
    'encryption_artifact_file',
    authConfig,
    vaultUrl
  );
  const direct_download = await getDirectDownloadInfo(
    attachmentID,
    'binary_file',
    authConfig,
    vaultUrl
  );
  let client = new AzureBlockDownload(direct_download_encrypted_artifact.url);
  const encrypted_artifact_uint8array: any = await client.start(null, null, null, null);
  const encrypted_artifact = JSON.parse(encrypted_artifact_uint8array.toString('utf-8'));
  client = new AzureBlockDownload(direct_download.url);
  const blocks: Buffer[] = [];

  for (let index = 0; index < encrypted_artifact.range.length; index++) {
    const block: any = await client.start(
      dek,
      encrypted_artifact.encryption_strategy,
      {
        iv: binaryBufferToString(new Uint8Array(encrypted_artifact.iv[index].data)),
        ad: encrypted_artifact.ad,
        at: binaryBufferToString(new Uint8Array(encrypted_artifact.at[index].data)),
      },
      encrypted_artifact.range[index]
    );
    blocks.push(block);
  }
  const byteArray = Buffer.concat(blocks);
  return { byteArray, direct_download };
}

async function getDirectDownloadInfo(
  id: string,
  type: string,
  authConfig: IFileStorageAuthConfiguration,
  vaultUrl: string
) {
  const api = new DirectAttachmentsApi(buildApiConfig(authConfig, vaultUrl, nodeFetch));
  const result = await api.directAttachmentsIdDownloadUrlGet(id, type);
  return result.attachment_direct_download_url;
}

export async function encryptAndUploadThumbnail({
  thumbnailFilePath,
  binaryId,
  attachmentDek,
  sizeType,
  authConfig,
  vaultUrl,
}: {
  thumbnailFilePath: string;
  binaryId: string;
  attachmentDek: string;
  sizeType: ThumbnailType;
  authConfig: IFileStorageAuthConfiguration;
  vaultUrl: string;
}) {
  const thumbnail = fs.readFileSync(thumbnailFilePath);

  return encryptAndUploadThumbnailCommon({
    thumbnailBufferString: binaryBufferToString(thumbnail),
    binaryId,
    attachmentDek,
    sizeType,
    authConfig,
    vaultUrl,
    fetchApi: nodeFetch,
  });
}

export async function downloadThumbnail({
  id,
  dataEncryptionKey,
  vaultUrl,
  authConfig,
}: {
  id: string;
  dataEncryptionKey: string;
  vaultUrl: string;
  authConfig: IFileStorageAuthConfiguration;
}) {
  return downloadThumbnailCommon({
    id,
    dataEncryptionKey,
    vaultUrl,
    authConfig,
    fetchApi: nodeFetch,
  });
}
