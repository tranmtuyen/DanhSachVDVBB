from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def player_photo_path(instance, filename):
    return f"players/{instance.id or 'new'}_{filename}"


def validate_photo_size(value):
    max_size = 1 * 1024 * 1024  # 1MB
    if value.size > max_size:
        raise ValidationError("Kích thước ảnh không được vượt quá 1MB.")


class Player(models.Model):
    name = models.CharField("Họ tên", max_length=150)
    nickname = models.CharField("Biệt danh", max_length=100, blank=True)
    photo = models.ImageField("Ảnh VĐV", upload_to=player_photo_path, blank=True, null=True, validators=[validate_photo_size])
    birth_year = models.PositiveIntegerField("Năm sinh", null=True, blank=True)
    id_number = models.CharField("CCCD", max_length=20, blank=True, default="")
    rating = models.IntegerField("Điểm rating", default=1000)
    # "Điểm gốc" — KHÔNG hiển thị ở đâu trong giao diện hiện tại, chỉ lưu sẵn làm dữ liệu nền cho các
    # tính năng tương lai. Định nghĩa: điểm gốc = điểm khởi tạo (lúc tạo VĐV) +/- các lần Quản trị
    # viên SỬA TAY điểm (services.adjust_rating). KHÔNG bao giờ bị ảnh hưởng bởi điểm thắng/thua trận
    # đấu (Elo) hay điểm thưởng thành tích giải — 2 nguồn đó chỉ thay đổi `rating`, không đụng tới đây.
    # Tự động gán = rating lúc tạo mới (xem save() bên dưới); tự động cộng/trừ theo đúng delta mỗi khi
    # adjust_rating() chạy (xem services.py) — không có chỗ nào khác được phép ghi đè trường này.
    base_rating = models.IntegerField("Điểm gốc", default=1000)
    join_date = models.DateField("Ngày tham gia CLB", auto_now_add=True)

    class Meta:
        verbose_name = "Vận động viên"
        verbose_name_plural = "Vận động viên"
        ordering = ["-rating"]

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.base_rating = self.rating
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    @property
    def hang(self):
        r = self.rating
        if r >= 2201:
            return "Chuyên"
        if r >= 2001:
            return "A"
        if r >= 1801:
            return "B"
        if r >= 1601:
            return "C"
        if r >= 1401:
            return "D"
        if r >= 1201:
            return "E"
        if r >= 1001:
            return "F"
        if r >= 801:
            return "G"
        return "H"


class Tournament(models.Model):
    KHONG_CHAP = "khong_chap"
    CO_CHAP = "co_chap"
    LOAI_GIAI_CHOICES = [
        (KHONG_CHAP, "Không chấp điểm"),
        (CO_CHAP, "Có chấp điểm"),
    ]
    STATUS_CHOICES = [
        ("sap_dien_ra", "Sắp diễn ra"),
        ("dang_dien_ra", "Đang diễn ra"),
        ("da_ket_thuc", "Đã kết thúc"),
    ]

    name = models.CharField("Tên giải", max_length=200)
    type = models.CharField("Loại giải", max_length=20, choices=LOAI_GIAI_CHOICES, default=KHONG_CHAP)
    date = models.DateField("Từ ngày")
    # Giải đấu nhập trước khi có trường này (hoặc nhập không chỉ định): coi như diễn ra đúng 1 ngày —
    # "Đến ngày" lấy giống "Từ ngày" (xem migration 0012 backfill dữ liệu cũ + services.record_tournament).
    date_to = models.DateField("Đến ngày", null=True, blank=True)
    # Trường DB cũ, không còn là nguồn sự thật — trạng thái hiển thị luôn được TÍNH TỰ ĐỘNG từ
    # "Từ ngày"/"Đến ngày" so với ngày hôm nay (xem computed_status). Giữ cột lại để không phải
    # migrate xóa, nhưng serializer không cho ghi đè qua API nữa.
    status = models.CharField("Trạng thái (cũ, không dùng)", max_length=20, choices=STATUS_CHOICES, default="dang_dien_ra")

    MO_DANG_KY = "mo_dang_ky"
    DONG_DANG_KY = "dong_dang_ky"
    REGISTRATION_STATUS_CHOICES = [
        (MO_DANG_KY, "Mở đăng ký"),
        (DONG_DANG_KY, "Đóng đăng ký"),
    ]
    # Bật/tắt thủ công bởi Admin/Quản lý giải — ĐỘC LẬP với trạng thái Sắp/Đang/Đã kết thúc (tính tự
    # động từ ngày ở trên). Khi "Mở đăng ký", VĐV đã liên kết tài khoản được tự đăng ký vào Danh sách
    # chờ (TournamentWaitlist) qua menu "Đăng ký thi đấu". Mặc định Mở đăng ký cho giải mới tạo.
    registration_status = models.CharField(
        "Đăng ký thi đấu", max_length=20, choices=REGISTRATION_STATUS_CHOICES, default=MO_DANG_KY
    )

    @property
    def effective_date_to(self):
        return self.date_to or self.date

    @property
    def computed_status(self):
        """Trạng thái THỰC TẾ, luôn suy ra từ ngày — không phụ thuộc trường status đã lưu:
        - Đến ngày < hôm nay           -> đã kết thúc
        - Từ ngày <= hôm nay <= Đến ngày -> đang diễn ra
        - hôm nay < Từ ngày            -> sắp diễn ra
        """
        today = timezone.localdate()
        if self.effective_date_to < today:
            return "da_ket_thuc"
        if self.date > today:
            return "sap_dien_ra"
        return "dang_dien_ra"

    class Meta:
        verbose_name = "Giải đấu"
        verbose_name_plural = "Giải đấu"
        ordering = ["-date"]

    def __str__(self):
        return self.name


class TournamentGroup(models.Model):
    """Bảng đấu (A, B, C...) trong 1 giải đấu, gồm các VĐV thi đấu vòng bảng."""
    tournament = models.ForeignKey(Tournament, verbose_name="Giải đấu", on_delete=models.CASCADE, related_name="groups")
    name = models.CharField("Tên bảng", max_length=20)
    players = models.ManyToManyField(Player, verbose_name="VĐV trong bảng", blank=True, related_name="tournament_groups")

    class Meta:
        verbose_name = "Bảng đấu"
        verbose_name_plural = "Bảng đấu"
        ordering = ["name"]
        unique_together = ("tournament", "name")

    def __str__(self):
        return f"{self.tournament} — Bảng {self.name}"


class TournamentWaitlist(models.Model):
    """Danh sách chờ đăng ký thi đấu của 1 giải đấu — ĐỘC LẬP với Bảng đấu/Vòng loại trực tiếp: đây
    chỉ là bước đăng ký/duyệt, Admin/Quản lý giải vẫn tự tay xếp VĐV đã "Đã xác nhận" vào Bảng đấu/
    Vòng loại trực tiếp như quy trình hiện có — xác nhận ở đây KHÔNG tự động thêm vào bảng nào."""
    ADMIN = "admin"
    SELF = "self"
    SOURCE_CHOICES = [
        (ADMIN, "Admin/Quản lý chọn"),
        (SELF, "VĐV tự đăng ký"),
    ]
    CHO = "cho"
    XAC_NHAN = "xac_nhan"
    STATUS_CHOICES = [
        (CHO, "Chờ"),
        (XAC_NHAN, "Đã xác nhận"),
    ]

    tournament = models.ForeignKey(Tournament, verbose_name="Giải đấu", on_delete=models.CASCADE, related_name="waitlist_entries")
    player = models.ForeignKey(Player, verbose_name="VĐV", on_delete=models.CASCADE, related_name="waitlist_entries")
    source = models.CharField("Hình thức", max_length=10, choices=SOURCE_CHOICES, default=ADMIN)
    status = models.CharField("Trạng thái", max_length=10, choices=STATUS_CHOICES, default=CHO)
    created_at = models.DateTimeField("Ngày đăng ký", auto_now_add=True)

    class Meta:
        verbose_name = "Danh sách chờ"
        verbose_name_plural = "Danh sách chờ"
        ordering = ["created_at"]
        unique_together = ("tournament", "player")

    def __str__(self):
        return f"{self.tournament} — {self.player} ({self.get_status_display()})"


class Match(models.Model):
    GIAO_HUU = "giao_huu"
    LOAI_TRAN_CHOICES = Tournament.LOAI_GIAI_CHOICES + [(GIAO_HUU, "Giao hữu")]
    MODE_CHOICES = [("don", "Đánh đơn"), ("doi", "Đánh đôi")]
    SIDE_CHOICES = [("A", "A"), ("B", "B")]
    STATUS_CHOICES = [("completed", "Đã kết thúc"), ("scheduled", "Sắp diễn ra")]
    # Lưu ý: "bang" (vòng bảng — do hệ thống tự gán), "ban_ket" và "chung_ket" là 3 giá trị
    # CỐ ĐỊNH, có ý nghĩa đặc biệt trong logic (vòng bảng gắn với TournamentGroup, "chung_ket"
    # dùng để xác định Nhà vô địch). Mọi giá trị khác là TÊN VÒNG ĐẤU TỰ DO do người nhập gõ
    # (VD: "Vòng 1/8", "Tứ kết", "Vòng 1/16", "Tranh hạng Ba"...) — không còn giới hạn choices.
    STAGE_CHOICES = [
        ("bang", "Vòng bảng"),
        ("ban_ket", "Bán kết"),
        ("chung_ket", "Chung kết"),
    ]

    tournament = models.ForeignKey(
        Tournament, verbose_name="Giải đấu", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="matches"
    )
    type = models.CharField("Loại trận", max_length=20, choices=LOAI_TRAN_CHOICES)
    mode = models.CharField("Thể thức", max_length=10, choices=MODE_CHOICES, default="don")
    status = models.CharField("Trạng thái trận đấu", max_length=12, choices=STATUS_CHOICES, default="completed")
    stage = models.CharField("Giai đoạn / Vòng đấu", max_length=30, blank=True, default="")
    group = models.ForeignKey(
        TournamentGroup, verbose_name="Bảng đấu", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="matches"
    )
    player_a = models.ForeignKey(Player, verbose_name="VĐV A", on_delete=models.CASCADE, related_name="matches_as_a")
    player_b = models.ForeignKey(Player, verbose_name="VĐV B", on_delete=models.CASCADE, related_name="matches_as_b")
    player_a2 = models.ForeignKey(
        Player, verbose_name="VĐV A2 (đôi)", null=True, blank=True,
        on_delete=models.CASCADE, related_name="matches_as_a2"
    )
    player_b2 = models.ForeignKey(
        Player, verbose_name="VĐV B2 (đôi)", null=True, blank=True,
        on_delete=models.CASCADE, related_name="matches_as_b2"
    )
    sets_a = models.PositiveIntegerField("Số ván thắng A", null=True, blank=True)
    sets_b = models.PositiveIntegerField("Số ván thắng B", null=True, blank=True)
    winner_side = models.CharField("Bên thắng", max_length=1, choices=SIDE_CHOICES, null=True, blank=True)
    delta_a = models.IntegerField("Thay đổi điểm A", default=0)
    delta_b = models.IntegerField("Thay đổi điểm B", default=0)
    # Điểm chấp (chỉ mang tính hiển thị/ghi chú — VD "2-0-2" — KHÔNG ảnh hưởng đến cách tính Elo hiện tại).
    # Chỉ nhập được khi tạo trận; giữ nguyên qua các lần sửa trận sau đó.
    handicap_a = models.CharField("Điểm chấp VĐV A", max_length=20, blank=True, default="")
    handicap_b = models.CharField("Điểm chấp VĐV B", max_length=20, blank=True, default="")
    date = models.DateField("Ngày diễn ra")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Trận đấu"
        verbose_name_plural = "Trận đấu"
        ordering = ["-date", "-created_at"]

    def __str__(self):
        if self.mode == "doi":
            return f"{self.player_a}&{self.player_a2} {self.sets_a}-{self.sets_b} {self.player_b}&{self.player_b2}"
        return f"{self.player_a} {self.sets_a}-{self.sets_b} {self.player_b}"


def match_media_path(instance, filename):
    return f"match_media/{instance.match_id or 'new'}_{filename}"


def validate_match_photo_size(value):
    max_size = 3 * 1024 * 1024  # 3MB — ảnh trận đấu thường chi tiết hơn ảnh đại diện VĐV
    if value.size > max_size:
        raise ValidationError("Kích thước ảnh không được vượt quá 3MB.")


class MatchMedia(models.Model):
    """1 ảnh hoặc 1 video YouTube minh họa cho 1 trận đấu — bảng companion thuần tuý (giống
    KnockoutSlot), KHÔNG đụng vào cấu trúc Match/Elo hiện có. Xóa media không ảnh hưởng điểm số."""
    PHOTO = "photo"
    YOUTUBE = "youtube"
    MEDIA_TYPE_CHOICES = [(PHOTO, "Ảnh"), (YOUTUBE, "Video YouTube")]

    match = models.ForeignKey(Match, verbose_name="Trận đấu", on_delete=models.CASCADE, related_name="media_items")
    media_type = models.CharField("Loại", max_length=10, choices=MEDIA_TYPE_CHOICES)
    image = models.ImageField(
        "Ảnh", upload_to=match_media_path, blank=True, null=True, validators=[validate_match_photo_size]
    )
    youtube_url = models.URLField("Link YouTube", blank=True, default="")
    youtube_video_id = models.CharField("Mã video YouTube", max_length=20, blank=True, default="")
    caption = models.CharField("Chú thích", max_length=200, blank=True, default="")
    order = models.PositiveSmallIntegerField("Thứ tự hiển thị", default=0)
    uploaded_by = models.ForeignKey(
        "auth.User", verbose_name="Người thêm", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ảnh/Video trận đấu"
        verbose_name_plural = "Ảnh/Video trận đấu"
        ordering = ["match_id", "order", "id"]

    def __str__(self):
        return f"{self.match} — {self.get_media_type_display()}"


class KnockoutSlot(models.Model):
    """1 "ô" trong SƠ ĐỒ vòng loại trực tiếp — sinh sẵn hàng loạt khi tạo sơ đồ (xem
    services.generate_bracket), đại diện cho 1 vị trí trận đấu trong cây đấu.

    round_no = 1 là vòng ĐẦU TIÊN (nhiều ô nhất); vòng cuối (round_no lớn nhất, chỉ 1 ô) luôn là
    Chung kết. slot_index là vị trí 0-based trong vòng đó. Ô (round_no, slot_index) luôn "nuôi"
    người thắng vào ô (round_no+1, slot_index // 2) — bên A nếu slot_index chẵn, bên B nếu lẻ —
    suy ra được từ vị trí, không cần lưu thêm liên kết "next".

    1 ô có 3 trạng thái:
    - Trống: match=None, bye_player=None (vòng > 1: đang chờ 1 hoặc cả 2 ô vòng trước có kết quả).
    - "Miễn đấu" (BYE): bye_player (+ bye_player2 nếu đánh đôi) được gán thẳng — VĐV/cặp này coi
      như thắng ô này ngay lập tức, không có trận, không tính Elo.
    - Có trận thật: match trỏ tới 1 Match bình thường — Match/Elo không có gì khác các trận khác,
      chỉ thêm liên kết 2 chiều này để biết trận nào thuộc ô nào của sơ đồ.
    """

    tournament = models.ForeignKey(Tournament, verbose_name="Giải đấu", on_delete=models.CASCADE, related_name="knockout_slots")
    round_no = models.PositiveSmallIntegerField("Vòng thứ (1 = vòng đầu tiên)")
    slot_index = models.PositiveSmallIntegerField("Vị trí trong vòng (0-based)")
    stage_name = models.CharField("Tên vòng", max_length=30)
    mode = models.CharField("Thể thức", max_length=10, choices=Match.MODE_CHOICES, default="don")
    match = models.OneToOneField(
        Match, verbose_name="Trận đấu", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="knockout_slot"
    )
    bye_player = models.ForeignKey(
        Player, verbose_name="VĐV miễn đấu (BYE)", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+"
    )
    bye_player2 = models.ForeignKey(
        Player, verbose_name="VĐV miễn đấu 2 (BYE, đánh đôi)", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ô sơ đồ vòng loại trực tiếp"
        verbose_name_plural = "Ô sơ đồ vòng loại trực tiếp"
        ordering = ["round_no", "slot_index"]
        unique_together = ("tournament", "round_no", "slot_index")

    def __str__(self):
        return f"{self.tournament} — {self.stage_name} #{self.slot_index + 1}"

    @property
    def winner(self):
        """(player, player2|None) THẮNG ô này, hoặc None nếu chưa có kết quả."""
        if self.bye_player_id:
            return (self.bye_player, self.bye_player2)
        if self.match_id and self.match.status == "completed" and self.match.winner_side:
            m = self.match
            return (m.player_a, m.player_a2) if m.winner_side == "A" else (m.player_b, m.player_b2)
        return None

    def next_slot(self):
        """Ô ở vòng kế tiếp mà ô này nuôi người thắng vào, hoặc None nếu đây đã là Chung kết."""
        return KnockoutSlot.objects.filter(
            tournament_id=self.tournament_id, round_no=self.round_no + 1, slot_index=self.slot_index // 2
        ).first()


class TournamentResult(models.Model):
    PLACEMENT_CHOICES = [
        ("vo_dich", "Vô địch"),
        ("a_quan", "Á quân"),
        ("hang_ba", "Hạng Ba"),
        ("tu_ket", "Tứ kết"),
    ]
    CONTENT_CHOICES = [
        ("don", "Đơn"),
        ("doi", "Đôi"),
        ("dong_doi", "Đồng đội"),
    ]

    tournament = models.ForeignKey(Tournament, verbose_name="Giải đấu", on_delete=models.CASCADE, related_name="results")
    content_type = models.CharField("Nội dung", max_length=10, choices=CONTENT_CHOICES, default="don")
    player = models.ForeignKey(Player, verbose_name="Vận động viên", on_delete=models.CASCADE, related_name="results")
    teammates = models.ManyToManyField(
        Player, verbose_name="Đồng đội (Đôi/Đồng đội)", blank=True, related_name="results_as_teammate"
    )
    placement = models.CharField("Thành tích", max_length=20, choices=PLACEMENT_CHOICES)
    bonus = models.IntegerField("Điểm thưởng (mỗi người)", default=0)
    bonus_applied = models.BooleanField("Đã cộng điểm cho VĐV", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Thành tích giải đấu"
        verbose_name_plural = "Thành tích giải đấu"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.player} — {self.get_placement_display()} ({self.tournament})"


class PointHistory(models.Model):
    player = models.ForeignKey(Player, verbose_name="Vận động viên", on_delete=models.CASCADE, related_name="history")
    date = models.DateField("Ngày")
    before = models.IntegerField("Điểm trước")
    after = models.IntegerField("Điểm sau")
    delta = models.IntegerField("Thay đổi")
    reason = models.CharField("Lý do", max_length=255)
    match = models.ForeignKey(
        Match, verbose_name="Trận đấu liên quan", null=True, blank=True,
        on_delete=models.CASCADE, related_name="history_entries"
    )
    result = models.ForeignKey(
        TournamentResult, verbose_name="Thành tích giải liên quan", null=True, blank=True,
        on_delete=models.CASCADE, related_name="history_entries"
    )
    match_score = models.CharField("Tỷ số", max_length=20, blank=True, default="")
    match_result = models.CharField("Thắng/Thua", max_length=10, blank=True, default="")
    is_doubles = models.BooleanField("Trận đôi", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Lịch sử điểm"
        verbose_name_plural = "Lịch sử điểm"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.player} {self.delta:+d} ({self.reason})"


class UserProfile(models.Model):
    """Gắn 1 tài khoản đăng nhập với đúng 1 VĐV (để sau này phát triển trang cá nhân)."""
    user = models.OneToOneField(
        "auth.User", verbose_name="Tài khoản", on_delete=models.CASCADE, related_name="profile"
    )
    player = models.OneToOneField(
        Player, verbose_name="Vận động viên gắn với", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="linked_account"
    )

    class Meta:
        verbose_name = "Hồ sơ tài khoản"
        verbose_name_plural = "Hồ sơ tài khoản"

    def __str__(self):
        return f"{self.user.username} — {self.player.name if self.player else '(chưa gắn VĐV)'}"


class LoginAttempt(models.Model):
    """
    Theo dõi số lần đăng nhập sai liên tiếp theo từng username, để bắt xác nhận
    Google reCAPTCHA sau 5 lần sai — chống dò mật khẩu tự động.
    """
    username = models.CharField("Tên đăng nhập", max_length=150, unique=True, db_index=True)
    failed_count = models.PositiveIntegerField("Số lần sai liên tiếp", default=0)
    updated_at = models.DateTimeField("Lần cập nhật gần nhất", auto_now=True)

    class Meta:
        verbose_name = "Lượt đăng nhập sai"
        verbose_name_plural = "Lượt đăng nhập sai"

    def __str__(self):
        return f"{self.username}: {self.failed_count} lần sai"


class RankingConfig(models.Model):
    """
    Cấu hình quy tắc tính điểm của CLB — CHỈ CÓ DUY NHẤT 1 bản ghi (singleton),
    chỉnh qua trang "Quản lý điểm" (chỉ Quản trị viên). Toàn bộ logic tính điểm
    (Elo + điểm thưởng thành tích) đều đọc giá trị từ đây, không còn hard-code.
    """
    k_khong_chap = models.PositiveIntegerField("Hệ số K — Giải Không chấp điểm", default=32)
    k_co_chap = models.PositiveIntegerField("Hệ số K — Giải Có chấp điểm", default=20)
    k_giao_huu = models.PositiveIntegerField("Hệ số K — Giao hữu", default=10)

    bonus_vo_dich = models.PositiveIntegerField("Điểm thưởng gốc — Vô địch", default=50)
    bonus_a_quan = models.PositiveIntegerField("Điểm thưởng gốc — Á quân", default=30)
    bonus_hang_ba = models.PositiveIntegerField("Điểm thưởng gốc — Hạng Ba", default=20)
    bonus_tu_ket = models.PositiveIntegerField("Điểm thưởng gốc — Tứ kết", default=10)

    mult_khong_chap = models.FloatField("Hệ số nhân thưởng — Không chấp điểm", default=1.6)
    mult_co_chap = models.FloatField("Hệ số nhân thưởng — Có chấp điểm", default=1.0)

    updated_at = models.DateTimeField("Cập nhật lần cuối", auto_now=True)

    class Meta:
        verbose_name = "Cấu hình tính điểm"
        verbose_name_plural = "Cấu hình tính điểm"

    def __str__(self):
        return "Cấu hình tính điểm CLB"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class HandicapRule(models.Model):
    """1 "khoảng" quy tắc điểm chấp, chỉnh ở tab "Điểm chấp" (trang Quản lý điểm, chỉ Admin):
    chênh lệch điểm rating giữa 2 VĐV rơi vào [min_diff, max_diff] -> đề xuất điểm chấp handicap_text
    (VD: 50-99 -> "0-2-0"). max_diff = NULL nghĩa là "trở lên", không giới hạn trên. handicap_text
    rỗng nghĩa là "không chấp" cho khoảng đó (VD: 0-49). Chỉ dùng để ĐỀ XUẤT ở giao diện nhập trận —
    không tự động áp dụng, không ảnh hưởng cách tính điểm (giống handicap_a/handicap_b của Match)."""
    min_diff = models.PositiveIntegerField("Chênh lệch điểm — Từ")
    max_diff = models.PositiveIntegerField("Chênh lệch điểm — Đến (để trống = trở lên)", null=True, blank=True)
    handicap_text = models.CharField("Điểm chấp đề xuất", max_length=20, blank=True, default="")

    class Meta:
        verbose_name = "Quy tắc điểm chấp"
        verbose_name_plural = "Quy tắc điểm chấp"
        ordering = ["min_diff"]

    def __str__(self):
        rng = f"{self.min_diff}–{self.max_diff}" if self.max_diff is not None else f"{self.min_diff}+"
        return f"{rng} = {self.handicap_text or 'Không chấp'}"
