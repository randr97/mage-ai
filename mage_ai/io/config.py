from abc import ABC, abstractmethod
from botocore.exceptions import ClientError
from enum import Enum
from jinja2 import Template
from mage_ai.data_preparation.repo_manager import get_repo_path
from pathlib import Path
from typing import Any, Dict, Union
import boto3
import os
import yaml


class ConfigKey(str, Enum):
    """
    List of configuration settings for use with data IO clients.
    """

    AWS_ACCESS_KEY_ID = 'AWS_ACCESS_KEY_ID'
    AWS_SECRET_ACCESS_KEY = 'AWS_SECRET_ACCESS_KEY'
    AWS_SESSION_TOKEN = 'AWS_SESSION_TOKEN'
    AWS_REGION = 'AWS_REGION'
    GOOGLE_SERVICE_ACC_KEY = 'GOOGLE_SERVICE_ACC_KEY'
    GOOGLE_SERVICE_ACC_KEY_FILEPATH = 'GOOGLE_SERVICE_ACC_KEY_FILEPATH'
    POSTGRES_DBNAME = 'POSTGRES_DBNAME'
    POSTGRES_USER = 'POSTGRES_USER'
    POSTGRES_PASSWORD = 'POSTGRES_PASSWORD'
    POSTGRES_HOST = 'POSTGRES_HOST'
    POSTGRES_PORT = 'POSTGRES_PORT'
    REDSHIFT_DBNAME = 'REDSHIFT_DBNAME'
    REDSHIFT_HOST = 'REDSHIFT_HOST'
    REDSHIFT_PORT = 'REDSHIFT_PORT'
    REDSHIFT_TEMP_CRED_USER = 'REDSHIFT_TEMP_CRED_USER'
    REDSHIFT_TEMP_CRED_PASSWORD = 'REDSHIFT_TEMP_CRED_PASSWORD'
    REDSHIFT_DBUSER = 'REDSHIFT_DBUSER'
    REDSHIFT_CLUSTER_ID = 'REDSHIFT_CLUSTER_ID'
    REDSHIFT_IAM_PROFILE = 'REDSHIFT_IAM_PROFILE'
    SNOWFLAKE_USER = 'SNOWFLAKE_USER'
    SNOWFLAKE_PASSWORD = 'SNOWFLAKE_PASSWORD'
    SNOWFLAKE_ACCOUNT = 'SNOWFLAKE_ACCOUNT'
    SNOWFLAKE_DEFAULT_WH = 'SNOWFLAKE_DEFAULT_WH'
    SNOWFLAKE_DEFAULT_DB = 'SNOWFLAKE_DEFAULT_DB'
    SNOWFLAKE_DEFAULT_SCHEMA = 'SNOWFLAKE_DEFAULT_SCHEMA'


class BaseConfigLoader(ABC):
    """
    Base configuration loader class. A configuration loader is a read-only storage of configuration
    settings. The source of the configuration settings is dependent on the specific loader.
    """

    @abstractmethod
    def contains(self, key: Union[ConfigKey, str], **kwargs) -> bool:
        """
        Checks if the configuration setting stored under `key` is contained.
        Args:
            key (Union[ConfigKey, str]): Name of the configuration setting to check existence of.

        Returns:
            bool: Returns true if configuration setting exists, otherwise returns false.
        """
        pass

    @abstractmethod
    def get(self, key: Union[ConfigKey, str], **kwargs) -> Any:
        """
        Loads the configuration setting stored under `key`.

        Args:
            key (Union[ConfigKey, str]): Name of the configuration setting to load

        Returns:
            Any: The configuration setting stored under `key` in the configuration manager. If key
                 doesn't exist, returns None.
        """
        pass

    def __contains__(self, key: Union[ConfigKey, str]) -> bool:
        return self.contains(key)

    def __getitem__(self, key: str) -> Any:
        return self.get(key)


class AWSSecretLoader(BaseConfigLoader):
    def __init__(self, **kwargs):
        self.client = boto3.client('secretsmanager', **kwargs)

    def contains(
        self, secret_id: Union[ConfigKey, str], version_id=None, version_stage_label=None
    ) -> bool:
        """
        Check if there is a secret with ID `secret_id` contained. Can also specify the version of the
        secret to check. If
        - both `version_id` and `version_stage_label` are specified, both must agree on the secret version
        - neither of `version_id` or `version_stage_label` are specified, any version is checked
        - one of `version_id` and `version_stage_label` are specified, the associated version is checked

        Args:
            secret_id (str): ID of the secret to load
            version_id (str, Optional): ID of the version of the secret to load. Defaults to None.
            version_stage_label (str, Optional): Staging label of the version of the secret to load. Defaults to None.

        Returns:
            Union(bytes, str): The secret stored under `secret_id` in AWS secret manager. If secret is:
            - a binary value, returns a `bytes` object
            - a string value, returns a `string` object
        """
        return self.__get_secret(secret_id, version_id, version_stage_label) is not None

    def get(
        self, secret_id: Union[ConfigKey, str], version_id=None, version_stage_label=None
    ) -> Union[bytes, str]:
        """
        Loads the secret stored under `secret_id`. Can also specify the version of the
        secret to fetch. If
        - both `version_id` and `version_stage_label` are specified, both must agree on the secret version
        - neither of `version_id` or `version_stage_label` are specified, the current version is loaded
        - one of `version_id` and `version_stage_label` are specified, the associated version is loaded

        Args:
            secret_id (str): ID of the secret to load
            version_id (str, Optional): ID of the version of the secret to load. Defaults to None.
            version_stage_label (str, Optional): Staging label of the version of the secret to load. Defaults to None.

        Returns:
            Union(bytes, str): The secret stored under `secret_id` in AWS secret manager. If secret is:
            - a binary value, returns a `bytes` object
            - a string value, returns a `string` object
        """
        response = self.__get_secret(secret_id, version_id, version_stage_label)
        if 'SecretBinary' in response:
            return response['SecretBinary']
        else:
            return response['SecretString']

    def __get_secret(
        self, secret_id: Union[ConfigKey, str], version_id=None, version_stage_label=None
    ) -> Dict:
        """
        Get secret with ID `secret_id`. Can also specify the version of the secret to get.
        If
        - both `version_id` and `version_stage_label` are specified, both must agree on the
          secret version
        - neither of `version_id` or `version_stage_label` are specified, a check is made for
          the current version
        - one of `version_id` and `version_stage_label` are specified, the associated version
          is loaded

        Args:
            secret_id (str): ID of the secret to load
            version_id (str, Optional): ID of the version of the secret to load. Defaults to None.
            version_stage_label (str, Optional): Staging label of the version of the secret to load.
            Defaults to None.

        Returns:
            Dict: response object returned by AWS Secrets Manager API
        """
        try:
            return self.client.get_secret_value(
                SecretID=secret_id,
                VersionId=version_id,
                VersionStage=version_stage_label,
            )
        except ClientError as error:
            if error.response['Error']['Code'] == 'ResourceNotFoundException':
                return None
            raise RuntimeError(f'Error loading config: {error.response["Error"]["Message"]}')


class EnvironmentVariableLoader(BaseConfigLoader):
    def contains(self, env_var: Union[ConfigKey, str]) -> bool:
        """
        Checks if the environment variable is defined.
        Args:
            key (Union[ConfigKey, str]): Name of the configuration setting to check existence of.

        Returns:
            bool: Returns true if configuration setting exists, otherwise returns false.
        """
        return env_var in os.environ

    def get(self, env_var: Union[ConfigKey, str]) -> Any:
        """
        Loads the config setting stored under the environment variable
        `env_var`.

        Args:
            env_var (str): Name of the environment variable to load configuration setting from

        Returns:
            Any: The configuration setting stored under `env_var`
        """
        return os.getenv(env_var)


class ConfigFileLoader(BaseConfigLoader):
    def __init__(self, filepath: os.PathLike = None, profile='default') -> None:
        """
        Initializes IO Configuration loader

        Args:
            filepath (os.PathLike, optional): Path to IO configuration file.
            Defaults to '[repo_path]/io_config.yaml'
            profile (str, optional): Profile to load configuration settings from. Defaults to 'default'.
        """
        if filepath is None:
            filepath = get_repo_path() / 'io_config.yaml'
        self.filepath = Path(filepath)
        self.profile = profile
        with self.filepath.open('r') as fin:
            config_file = Template(fin.read()).render(env_var=os.getenv)
            self.config = yaml.full_load(config_file)[profile]

    def contains(self, key: Union[ConfigKey, str]) -> Any:
        """
        Checks of the configuration setting stored under `key` is contained.

        Args:
            key (str): Name of the configuration setting to check.
        """
        return key in self.config

    def get(self, key: Union[ConfigKey, str]) -> Any:
        """
        Loads the configuration setting stored under `key`.

        Args:
            key (str): Key name of the configuration setting to load
        """
        return self.config.get(key)