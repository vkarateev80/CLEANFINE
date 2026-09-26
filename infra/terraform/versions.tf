terraform {
  required_version = ">= 1.5.0"

  required_providers {
    dns = {
      source  = "hashicorp/dns"
      version = "~> 3.4"
    }
    # При подключении реального облака раскомментировать:
    # google = { source = "hashicorp/google", version = "~> 5.0" }
    # aws    = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  # Backend раскомментировать для продакшна (пример GCS):
  # backend "gcs" {
  #   bucket = "cleanfine-tfstate"
  #   prefix = "prod"
  # }
}
