from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Tạo sẵn 4 nhóm quyền: QuanTriVien, QuanLyGiaiDau, NguoiNhapLieu, NguoiDung"

    def handle(self, *args, **options):
        for name in ["QuanTriVien", "QuanLyGiaiDau", "NguoiNhapLieu", "NguoiDung"]:
            group, created = Group.objects.get_or_create(name=name)
            msg = "Đã tạo" if created else "Đã có sẵn"
            self.stdout.write(f"{msg}: {name}")
