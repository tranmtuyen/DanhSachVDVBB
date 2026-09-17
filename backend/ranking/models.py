from django.db import models


def player_photo_path(instance, filename):
    return f"players/{instance.id or 'new'}_{filename}"


class Player(models.Model):
    name = models.CharField("Họ tên", max_length=150)
    nickname = models.CharField("Biệt danh", max_length=100, blank=True)
    photo = models.ImageField("Ảnh VĐV", upload_to=player_photo_path, blank=True, null=True)
    birth_year = models.PositiveIntegerField("Năm sinh", null=True, blank=True)
    id_number = models.CharField("CCCD", max_length=20, blank=True, default="")
    rating = models.IntegerField("Điểm rating", default=1000)
    join_date = models.DateField("Ngày tham gia CLB", auto_now_add=True)

    class Meta:
        verbose_name = "Vận động viên"
        verbose_name_plural = "Vận động viên"
        ordering = ["-rating"]

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
        ("dang_dien_ra", "Đang diễn ra"),
        ("da_ket_thuc", "Đã kết thúc"),
    ]

    name = models.CharField("Tên giải", max_length=200)
    type = models.CharField("Loại giải", max_length=20, choices=LOAI_GIAI_CHOICES, default=KHONG_CHAP)
    date = models.DateField("Ngày tổ chức")
    status = models.CharField("Trạng thái", max_length=20, choices=STATUS_CHOICES, default="dang_dien_ra")

    class Meta:
        verbose_name = "Giải đấu"
        verbose_name_plural = "Giải đấu"
        ordering = ["-date"]

    def __str__(self):
        return self.name


class Match(models.Model):
    GIAO_HUU = "giao_huu"
    LOAI_TRAN_CHOICES = Tournament.LOAI_GIAI_CHOICES + [(GIAO_HUU, "Giao hữu")]
    MODE_CHOICES = [("don", "Đánh đơn"), ("doi", "Đánh đôi")]
    SIDE_CHOICES = [("A", "A"), ("B", "B")]
    STATUS_CHOICES = [("completed", "Đã kết thúc"), ("scheduled", "Sắp diễn ra")]

    tournament = models.ForeignKey(
        Tournament, verbose_name="Giải đấu", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="matches"
    )
    type = models.CharField("Loại trận", max_length=20, choices=LOAI_TRAN_CHOICES)
    mode = models.CharField("Thể thức", max_length=10, choices=MODE_CHOICES, default="don")
    status = models.CharField("Trạng thái trận đấu", max_length=12, choices=STATUS_CHOICES, default="completed")
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


class TournamentResult(models.Model):
    PLACEMENT_CHOICES = [
        ("vo_dich", "Vô địch"),
        ("a_quan", "Á quân"),
        ("hang_ba", "Hạng Ba"),
        ("tu_ket", "Tứ kết"),
    ]

    tournament = models.ForeignKey(Tournament, verbose_name="Giải đấu", on_delete=models.CASCADE, related_name="results")
    player = models.ForeignKey(Player, verbose_name="Vận động viên", on_delete=models.CASCADE, related_name="results")
    placement = models.CharField("Thành tích", max_length=20, choices=PLACEMENT_CHOICES)
    bonus = models.IntegerField("Điểm thưởng")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Thành tích giải đấu"
        verbose_name_plural = "Thành tích giải đấu"

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
