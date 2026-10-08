variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "server_image" {
  type = string
}

variable "web_image" {
  type = string
}

variable "database_url_secret" {
  type        = string
  description = "Secret Manager secret id holding DATABASE_URL, the shared Postgres database."
}

resource "google_cloud_run_v2_service" "server" {
  name     = "panel-server"
  location = var.region
  project  = var.project

  template {
    containers {
      image = var.server_image
      ports {
        container_port = 8787
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.database_url_secret
            version = "latest"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "web" {
  name     = "panel-web"
  location = var.region
  project  = var.project

  template {
    containers {
      image = var.web_image
      env {
        name  = "NEXT_PUBLIC_PANEL_URL"
        value = google_cloud_run_v2_service.server.uri
      }
    }
  }
}

variable "alert_email" {
  type    = string
  default = ""
}

locals {
  server_host = trimprefix(google_cloud_run_v2_service.server.uri, "https://")
}

resource "google_monitoring_uptime_check_config" "readyz" {
  display_name = "panel readyz"
  timeout      = "10s"
  period       = "60s"
  project      = var.project

  http_check {
    path         = "/readyz"
    port         = "443"
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project
      host       = local.server_host
    }
  }
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email == "" ? 0 : 1
  display_name = "panel alerts"
  type         = "email"
  project      = var.project
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_alert_policy" "readyz" {
  count        = var.alert_email == "" ? 0 : 1
  display_name = "panel /readyz"
  combiner     = "OR"
  project      = var.project

  conditions {
    display_name = "readyz check failed"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.readyz.uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

output "server_uri" {
  value = google_cloud_run_v2_service.server.uri
}

output "web_uri" {
  value = google_cloud_run_v2_service.web.uri
}
