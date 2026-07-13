class MoodEntry {
  final String id;
  final String userId;
  final int score;
  final String? note;
  final List<String> tags;
  final String? aiReflection;
  final DateTime createdAt;

  const MoodEntry({
    required this.id,
    required this.userId,
    required this.score,
    this.note,
    required this.tags,
    this.aiReflection,
    required this.createdAt,
  });

  factory MoodEntry.fromJson(Map<String, dynamic> json) => MoodEntry(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        score: json['score'] as int,
        note: json['note'] as String?,
        tags: (json['tags'] as List<dynamic>).cast<String>(),
        aiReflection: json['ai_reflection'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class MoodStreak {
  final int current;
  final int longest;
  final DateTime? lastLoggedAt;
  final bool isActiveToday;

  const MoodStreak({
    required this.current,
    required this.longest,
    this.lastLoggedAt,
    required this.isActiveToday,
  });

  factory MoodStreak.fromJson(Map<String, dynamic> json) => MoodStreak(
        current: json['current'] as int,
        longest: json['longest'] as int,
        lastLoggedAt: json['last_logged_at'] != null
            ? DateTime.parse(json['last_logged_at'] as String)
            : null,
        isActiveToday: json['is_active_today'] as bool,
      );
}

class MoodSummary {
  final String period;
  final double average;
  final int min;
  final int max;
  final int totalEntries;
  final String trend;

  const MoodSummary({
    required this.period,
    required this.average,
    required this.min,
    required this.max,
    required this.totalEntries,
    required this.trend,
  });

  factory MoodSummary.fromJson(Map<String, dynamic> json) => MoodSummary(
        period: json['period'] as String,
        average: (json['average'] as num).toDouble(),
        min: json['min'] as int,
        max: json['max'] as int,
        totalEntries: json['total_entries'] as int,
        trend: json['trend'] as String,
      );
}
