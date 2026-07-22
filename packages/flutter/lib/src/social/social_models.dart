class GlobalFeedEntry {
  final String id;
  final int score;
  final List<String> tags;
  final String? country;
  final String? city;
  final DateTime createdAt;

  const GlobalFeedEntry({
    required this.id,
    required this.score,
    required this.tags,
    this.country,
    this.city,
    required this.createdAt,
  });

  factory GlobalFeedEntry.fromJson(Map<String, dynamic> json) =>
      GlobalFeedEntry(
        id: json['id'] as String,
        score: json['score'] as int,
        tags: (json['tags'] as List<dynamic>).cast<String>(),
        country: json['country'] as String?,
        city: json['city'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class LeaderboardEntry {
  final int rank;
  final String userId;
  final String displayName;
  final String? avatarUrl;
  final int streak;
  final int totalEntries;
  final String echoBalance;
  final double weeklyScore;

  const LeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.displayName,
    this.avatarUrl,
    required this.streak,
    required this.totalEntries,
    required this.echoBalance,
    required this.weeklyScore,
  });

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) =>
      LeaderboardEntry(
        rank: json['rank'] as int,
        userId: json['user_id'] as String,
        displayName: json['display_name'] as String,
        avatarUrl: json['avatar_url'] as String?,
        streak: json['streak'] as int,
        totalEntries: json['total_entries'] as int,
        echoBalance: json['echo_balance'] as String,
        weeklyScore: (json['weekly_score'] as num).toDouble(),
      );
}
