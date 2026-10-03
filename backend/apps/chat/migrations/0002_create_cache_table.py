"""Create the table behind the DatabaseCache that the throttles count in.

A migration rather than a step in start.sh, because only Render runs start.sh:
whatever migrates the database -- Render's boot, a manual migrate before a
Vercel deploy, or the test runner -- also gets the cache table this way.
createcachetable is idempotent, so running it on a database that already has
the table is harmless.
"""
from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command('createcachetable', database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_cache_table, migrations.RunPython.noop),
    ]
