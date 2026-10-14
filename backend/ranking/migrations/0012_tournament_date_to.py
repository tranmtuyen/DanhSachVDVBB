# Thêm "Đến ngày" cho Giải đấu (giải nhiều ngày). Các giải đã nhập từ trước (chỉ có "date") được
# backfill date_to = date, tức "Từ ngày" = "Đến ngày" = ngày diễn ra cũ, đúng như yêu cầu.

from django.db import migrations, models


def backfill_date_to(apps, schema_editor):
    Tournament = apps.get_model('ranking', 'Tournament')
    Tournament.objects.filter(date_to__isnull=True).update(date_to=models.F('date'))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ranking', '0011_alter_match_stage'),
    ]

    operations = [
        migrations.AddField(
            model_name='tournament',
            name='date_to',
            field=models.DateField(blank=True, null=True, verbose_name='Đến ngày'),
        ),
        migrations.AlterField(
            model_name='tournament',
            name='date',
            field=models.DateField(verbose_name='Từ ngày'),
        ),
        migrations.RunPython(backfill_date_to, noop_reverse),
    ]
