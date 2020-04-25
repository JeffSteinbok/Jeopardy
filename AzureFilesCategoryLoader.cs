﻿using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Threading.Tasks;
using Microsoft.Azure; // Namespace for Azure Configuration Manager
using Microsoft.Azure.Storage; // Namespace for Storage Client Library
using Microsoft.Azure.Storage.File; // Namespace for Azure Files
using Microsoft.Azure.Services.AppAuthentication;
using Microsoft.Azure.Storage.Auth;
using Azure.Identity;

namespace Jeffpardy
{
    public class AzureFilesCategoryLoader
    {
        private static readonly Lazy<AzureFilesCategoryLoader> instance = new Lazy<AzureFilesCategoryLoader>(() => new AzureFilesCategoryLoader());

        public static AzureFilesCategoryLoader Instance
        {
            get
            {
                return instance.Value;
            }
        }

        private readonly CloudFileClient fileClient;

        private AzureFilesCategoryLoader()
        {
            // Old and new way to do this.  Dev box needs the old way still.
            // Need to find a way to store this securely.
            bool useMSI = false;

            if (useMSI)
            {
                
                var tokenProvider = new AzureServiceTokenProvider();
                string accessToken = tokenProvider.GetAccessTokenAsync("https://storage.azure.com", "504100e4-0ce1-432d-8514-d778be5b51f5").Result;
                var tokenCredentials = new TokenCredential(accessToken);
                var storageCredentials = new StorageCredentials(tokenCredentials);
                
                // Create a CloudFileClient object for credentialed access to Azure Files.
                this.fileClient = new CloudFileClient(new Uri("https://jeffpardy.file.core.windows.net"), storageCredentials);
                
            }
            else
            {
                CloudStorageAccount storageAccount =
                    CloudStorageAccount.Parse("BlobEndpoint=https://jeffpardy.blob.core.windows.net/;QueueEndpoint=https://jeffpardy.queue.core.windows.net/;FileEndpoint=https://jeffpardy.file.core.windows.net/;TableEndpoint=https://jeffpardy.table.core.windows.net/;SharedAccessSignature=sv=2019-02-02&ss=f&srt=sco&sp=rlc&se=2021-03-02T03:52:17Z&st=2020-04-14T18:52:17Z&spr=https&sig=HqZKIWXRQjJHUzluaKM0jdy%2FOugE58a9VWBzIk%2ByW0E%3D");

                // Create a CloudFileClient object for credentialed access to Azure Files.
                this.fileClient = storageAccount.CreateCloudFileClient();
            }
        }
        
        public void PopulateSeasonManifest(ISeasonManifestCache seasonManifestCache)
        {
            // Get a reference to the file share we created previously.
            CloudFileShare share = fileClient.GetShareReference("configuration");

            // Ensure that the share exists.
            if (share.Exists())
            {
                // Get a reference to the root directory for the share.
                CloudFileDirectory rootDir = share.GetRootDirectoryReference();

                // Get a reference to the directory we created previously.
                CloudFileDirectory categoriesDir = rootDir.GetDirectoryReference("categories");

                // Ensure that the directory exists.
                if (categoriesDir.Exists())
                {
                    foreach (CloudFileDirectory seasonDirectory in categoriesDir.ListFilesAndDirectories())
                    {
                        CloudFile file = seasonDirectory.GetFileReference("seasonManifest.json");
                        string content = file.DownloadTextAsync().Result;

                        SeasonManifest seasonManifest = JsonConvert.DeserializeObject<SeasonManifest>(content);
                        seasonManifestCache.AddSeason(seasonManifest);

                        Debug.WriteLine("Loaded: {0}", file.Uri);
                    }
                }
            }
        }

        public async Task<Category> LoadCategoryAsync(ManifestCategory manifestCategory)
        {
            Category ret = null;

            // Get a reference to the file share we created previously.
            CloudFileShare share = fileClient.GetShareReference("configuration");

            // Ensure that the share exists.
            if (share.Exists())
            {
                // Get a reference to the root directory for the share.
                CloudFileDirectory rootDir = share.GetRootDirectoryReference();

                // Get a reference to the directory we created previously.
                CloudFileDirectory categoriesDir = rootDir.GetDirectoryReference("categories");
                CloudFileDirectory seasonDir = categoriesDir.GetDirectoryReference(manifestCategory.Season.ToString("000"));
                CloudFile categoryFile = seasonDir.GetFileReference(manifestCategory.FileName);

                // Ensure that the directory exists.
                if (categoryFile.Exists())
                {
                    string content = await categoryFile.DownloadTextAsync();
                    ret = JsonConvert.DeserializeObject<Category>(content);

                    // Perform some manual fix-up on categories and clues.  This is easier than
                    // re-generating all the content, but as bugs are fixed, this fixup can be removed.
                    foreach(var clue in ret.Clues)
                    {
                        clue.Clue = FixupJArchiveContent(clue.Clue);
                        clue.Question = FixupJArchiveContent(clue.Question);
                    }

                    Debug.WriteLine("Loaded: {0}", categoryFile.Uri);
                }
            }
            return ret;
        }

        private string FixupJArchiveContent(string content)
        {
            return content.Replace("<br />", "\n")
                          .Replace("\\'", "'")
                          .Replace("&amp;", "&");
        }
    }
}
