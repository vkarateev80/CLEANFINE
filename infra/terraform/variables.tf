variable "project" {
  type        = string
  description = "Имя проекта (prefix для ресурсов и DNS)"
  default     = "cleanfine"
}

variable "environment" {
  type        = string
  description = "prod | staging"
  default     = "prod"
  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment: prod | staging"
  }
}

variable "domain_admin" {
  type        = string
  description = "Хост админки (A → ingress LB)"
}

variable "domain_portal" {
  type        = string
  description = "Хост портала заказчика"
}

variable "dns_zone_id" {
  type        = string
  description = "ID DNS-зоны провайдера (для hashicorp/dns или аналога)"
}

variable "ingress_lb_ip" {
  type        = string
  description = "External IP ingress-контроллера (после установки nginx-ingress)"
}

variable "registry" {
  type        = string
  description = "Container registry для образов cleaning-ops/*"
  default     = "ghcr.io/vkarateev80"
}
