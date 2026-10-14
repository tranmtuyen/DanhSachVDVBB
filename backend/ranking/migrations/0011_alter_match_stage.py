# Bỏ giới hạn "choices" cố định của trường stage (Giai đoạn/Vòng đấu) và tăng max_length
# lên 30 để cho phép nhập TÊN VÒNG ĐẤU TỰ DO (VD: "Vòng 1/16", "Tứ kết", "Tranh hạng Ba"...).
# Chỉ còn "bang", "ban_ket", "chung_ket" là 3 giá trị có ý nghĩa đặc biệt trong logic ứng dụng
# (xem models.py) — không ảnh hưởng dữ liệu các trận đã có sẵn.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ranking', '0010_match_handicap_a_match_handicap_b'),
    ]

    operations = [
        migrations.AlterField(
            model_name='match',
            name='stage',
            field=models.CharField(blank=True, default='', max_length=30, verbose_name='Giai đoạn / Vòng đấu'),
        ),
    ]
