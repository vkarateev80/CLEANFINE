# DNS-записи для Ingress (A → LB IP). Сертификат TLS выдаёт cert-manager
# внутри кластера (infra/k8s/ingress.yaml, ClusterIssuer letsencrypt-prod).

resource "dns_a_record_set" "admin" {
  zone  = var.dns_zone_id
  name  = var.domain_admin
  ttl   = 300
  addresses = [var.ingress_lb_ip]
}

resource "dns_a_record_set" "portal" {
  zone  = var.dns_zone_id
  name  = var.domain_portal
  ttl   = 300
  addresses = [var.ingress_lb_ip]
}

output "admin_host" {
  value = var.domain_admin
}

output "portal_host" {
  value = var.domain_portal
}

output "image_prefix" {
  value = "${var.registry}/cleaning-ops"
}
