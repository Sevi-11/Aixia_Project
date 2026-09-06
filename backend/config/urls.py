"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include


def healthz(_request):
    """Liveness probe for Render's health check and the Docker HEALTHCHECK.

    Deliberately does not touch the database or any upstream API. This answers
    "is the process accepting requests", not "is every dependency healthy" -- a
    Supabase blip should not convince Render to kill an otherwise fine
    container, and a probe that costs a DB round trip on a free-tier instance
    is a probe that competes with real traffic.
    """
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('admin/', admin.site.urls),
    path('api/documents/', include('documents.d_urls')),
    path('api/chat/', include('chat.c_urls'))
]
