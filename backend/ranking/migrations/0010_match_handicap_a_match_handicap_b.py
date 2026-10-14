# Generated manually (tương đương `python manage.py makemigrations`) — thêm 2 trường
# điểm chấp (hiển thị) cho Match, không ảnh hưởng cách tính Elo hiện có.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ranking', '0009_match_stage_tournamentgroup_match_group'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='handicap_a',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Điểm chấp VĐV A'),
        ),
        migrations.AddField(
            model_name='match',
            name='handicap_b',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Điểm chấp VĐV B'),
        ),
    ]
