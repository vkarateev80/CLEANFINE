// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $PendingActionsTable extends PendingActions
    with TableInfo<$PendingActionsTable, PendingActionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PendingActionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
      'kind', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadJsonMeta =
      const VerificationMeta('payloadJson');
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
      'payload_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _idempotencyKeyMeta =
      const VerificationMeta('idempotencyKey');
  @override
  late final GeneratedColumn<String> idempotencyKey = GeneratedColumn<String>(
      'idempotency_key', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('pending'));
  static const VerificationMeta _attemptsMeta =
      const VerificationMeta('attempts');
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
      'attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _lastErrorMeta =
      const VerificationMeta('lastError');
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
      'last_error', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _nextAttemptAtMeta =
      const VerificationMeta('nextAttemptAt');
  @override
  late final GeneratedColumn<DateTime> nextAttemptAt =
      GeneratedColumn<DateTime>('next_attempt_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _syncedAtMeta =
      const VerificationMeta('syncedAt');
  @override
  late final GeneratedColumn<DateTime> syncedAt = GeneratedColumn<DateTime>(
      'synced_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        kind,
        payloadJson,
        idempotencyKey,
        status,
        attempts,
        lastError,
        nextAttemptAt,
        createdAt,
        syncedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_actions';
  @override
  VerificationContext validateIntegrity(Insertable<PendingActionRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
          _kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
          _payloadJsonMeta,
          payloadJson.isAcceptableOrUnknown(
              data['payload_json']!, _payloadJsonMeta));
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('idempotency_key')) {
      context.handle(
          _idempotencyKeyMeta,
          idempotencyKey.isAcceptableOrUnknown(
              data['idempotency_key']!, _idempotencyKeyMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('attempts')) {
      context.handle(_attemptsMeta,
          attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));
    }
    if (data.containsKey('last_error')) {
      context.handle(_lastErrorMeta,
          lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta));
    }
    if (data.containsKey('next_attempt_at')) {
      context.handle(
          _nextAttemptAtMeta,
          nextAttemptAt.isAcceptableOrUnknown(
              data['next_attempt_at']!, _nextAttemptAtMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('synced_at')) {
      context.handle(_syncedAtMeta,
          syncedAt.isAcceptableOrUnknown(data['synced_at']!, _syncedAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PendingActionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingActionRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      kind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      payloadJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_json'])!,
      idempotencyKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}idempotency_key']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      attempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}attempts'])!,
      lastError: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}last_error']),
      nextAttemptAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}next_attempt_at']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
      syncedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}synced_at']),
    );
  }

  @override
  $PendingActionsTable createAlias(String alias) {
    return $PendingActionsTable(attachedDatabase, alias);
  }
}

class PendingActionRow extends DataClass
    implements Insertable<PendingActionRow> {
  /// Локальный uuid v4 — он же ключ интерфейса.
  final String id;

  /// `kind`: `sos`, `operation_completed`, `sos_attach_photo` (`PendingActionTypes`).
  final String kind;

  /// Полезная нагрузка действия (JSON), см. DS-002 §4.2.
  final String payloadJson;

  /// Ключ идемпотентности: `op:<ticketId>:<operationId>`, `sos:<clientRequestId>`.
  final String? idempotencyKey;

  /// `pending` | `sending` | `failed` | `synced`.
  final String status;
  final int attempts;
  final String? lastError;

  /// Время следующей попытки (экспоненциальная задержка).
  final DateTime? nextAttemptAt;
  final DateTime createdAt;
  final DateTime? syncedAt;
  const PendingActionRow(
      {required this.id,
      required this.kind,
      required this.payloadJson,
      this.idempotencyKey,
      required this.status,
      required this.attempts,
      this.lastError,
      this.nextAttemptAt,
      required this.createdAt,
      this.syncedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['kind'] = Variable<String>(kind);
    map['payload_json'] = Variable<String>(payloadJson);
    if (!nullToAbsent || idempotencyKey != null) {
      map['idempotency_key'] = Variable<String>(idempotencyKey);
    }
    map['status'] = Variable<String>(status);
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    if (!nullToAbsent || nextAttemptAt != null) {
      map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    if (!nullToAbsent || syncedAt != null) {
      map['synced_at'] = Variable<DateTime>(syncedAt);
    }
    return map;
  }

  PendingActionsCompanion toCompanion(bool nullToAbsent) {
    return PendingActionsCompanion(
      id: Value(id),
      kind: Value(kind),
      payloadJson: Value(payloadJson),
      idempotencyKey: idempotencyKey == null && nullToAbsent
          ? const Value.absent()
          : Value(idempotencyKey),
      status: Value(status),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      nextAttemptAt: nextAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(nextAttemptAt),
      createdAt: Value(createdAt),
      syncedAt: syncedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(syncedAt),
    );
  }

  factory PendingActionRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingActionRow(
      id: serializer.fromJson<String>(json['id']),
      kind: serializer.fromJson<String>(json['kind']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      idempotencyKey: serializer.fromJson<String?>(json['idempotencyKey']),
      status: serializer.fromJson<String>(json['status']),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      nextAttemptAt: serializer.fromJson<DateTime?>(json['nextAttemptAt']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      syncedAt: serializer.fromJson<DateTime?>(json['syncedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'kind': serializer.toJson<String>(kind),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'idempotencyKey': serializer.toJson<String?>(idempotencyKey),
      'status': serializer.toJson<String>(status),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'nextAttemptAt': serializer.toJson<DateTime?>(nextAttemptAt),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'syncedAt': serializer.toJson<DateTime?>(syncedAt),
    };
  }

  PendingActionRow copyWith(
          {String? id,
          String? kind,
          String? payloadJson,
          Value<String?> idempotencyKey = const Value.absent(),
          String? status,
          int? attempts,
          Value<String?> lastError = const Value.absent(),
          Value<DateTime?> nextAttemptAt = const Value.absent(),
          DateTime? createdAt,
          Value<DateTime?> syncedAt = const Value.absent()}) =>
      PendingActionRow(
        id: id ?? this.id,
        kind: kind ?? this.kind,
        payloadJson: payloadJson ?? this.payloadJson,
        idempotencyKey:
            idempotencyKey.present ? idempotencyKey.value : this.idempotencyKey,
        status: status ?? this.status,
        attempts: attempts ?? this.attempts,
        lastError: lastError.present ? lastError.value : this.lastError,
        nextAttemptAt:
            nextAttemptAt.present ? nextAttemptAt.value : this.nextAttemptAt,
        createdAt: createdAt ?? this.createdAt,
        syncedAt: syncedAt.present ? syncedAt.value : this.syncedAt,
      );
  PendingActionRow copyWithCompanion(PendingActionsCompanion data) {
    return PendingActionRow(
      id: data.id.present ? data.id.value : this.id,
      kind: data.kind.present ? data.kind.value : this.kind,
      payloadJson:
          data.payloadJson.present ? data.payloadJson.value : this.payloadJson,
      idempotencyKey: data.idempotencyKey.present
          ? data.idempotencyKey.value
          : this.idempotencyKey,
      status: data.status.present ? data.status.value : this.status,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      nextAttemptAt: data.nextAttemptAt.present
          ? data.nextAttemptAt.value
          : this.nextAttemptAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      syncedAt: data.syncedAt.present ? data.syncedAt.value : this.syncedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingActionRow(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('idempotencyKey: $idempotencyKey, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('createdAt: $createdAt, ')
          ..write('syncedAt: $syncedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, kind, payloadJson, idempotencyKey, status,
      attempts, lastError, nextAttemptAt, createdAt, syncedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingActionRow &&
          other.id == this.id &&
          other.kind == this.kind &&
          other.payloadJson == this.payloadJson &&
          other.idempotencyKey == this.idempotencyKey &&
          other.status == this.status &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.nextAttemptAt == this.nextAttemptAt &&
          other.createdAt == this.createdAt &&
          other.syncedAt == this.syncedAt);
}

class PendingActionsCompanion extends UpdateCompanion<PendingActionRow> {
  final Value<String> id;
  final Value<String> kind;
  final Value<String> payloadJson;
  final Value<String?> idempotencyKey;
  final Value<String> status;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<DateTime?> nextAttemptAt;
  final Value<DateTime> createdAt;
  final Value<DateTime?> syncedAt;
  final Value<int> rowid;
  const PendingActionsCompanion({
    this.id = const Value.absent(),
    this.kind = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.idempotencyKey = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.nextAttemptAt = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.syncedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingActionsCompanion.insert({
    required String id,
    required String kind,
    required String payloadJson,
    this.idempotencyKey = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.nextAttemptAt = const Value.absent(),
    required DateTime createdAt,
    this.syncedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        kind = Value(kind),
        payloadJson = Value(payloadJson),
        createdAt = Value(createdAt);
  static Insertable<PendingActionRow> custom({
    Expression<String>? id,
    Expression<String>? kind,
    Expression<String>? payloadJson,
    Expression<String>? idempotencyKey,
    Expression<String>? status,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<DateTime>? nextAttemptAt,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? syncedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (kind != null) 'kind': kind,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (idempotencyKey != null) 'idempotency_key': idempotencyKey,
      if (status != null) 'status': status,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (nextAttemptAt != null) 'next_attempt_at': nextAttemptAt,
      if (createdAt != null) 'created_at': createdAt,
      if (syncedAt != null) 'synced_at': syncedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingActionsCompanion copyWith(
      {Value<String>? id,
      Value<String>? kind,
      Value<String>? payloadJson,
      Value<String?>? idempotencyKey,
      Value<String>? status,
      Value<int>? attempts,
      Value<String?>? lastError,
      Value<DateTime?>? nextAttemptAt,
      Value<DateTime>? createdAt,
      Value<DateTime?>? syncedAt,
      Value<int>? rowid}) {
    return PendingActionsCompanion(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      payloadJson: payloadJson ?? this.payloadJson,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      createdAt: createdAt ?? this.createdAt,
      syncedAt: syncedAt ?? this.syncedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (idempotencyKey.present) {
      map['idempotency_key'] = Variable<String>(idempotencyKey.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (nextAttemptAt.present) {
      map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (syncedAt.present) {
      map['synced_at'] = Variable<DateTime>(syncedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingActionsCompanion(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('idempotencyKey: $idempotencyKey, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('createdAt: $createdAt, ')
          ..write('syncedAt: $syncedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $GpsPointsTable extends GpsPoints
    with TableInfo<$GpsPointsTable, GpsPointRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $GpsPointsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _latMeta = const VerificationMeta('lat');
  @override
  late final GeneratedColumn<double> lat = GeneratedColumn<double>(
      'lat', aliasedName, false,
      type: DriftSqlType.double, requiredDuringInsert: true);
  static const VerificationMeta _lngMeta = const VerificationMeta('lng');
  @override
  late final GeneratedColumn<double> lng = GeneratedColumn<double>(
      'lng', aliasedName, false,
      type: DriftSqlType.double, requiredDuringInsert: true);
  static const VerificationMeta _accuracyMeta =
      const VerificationMeta('accuracy');
  @override
  late final GeneratedColumn<double> accuracy = GeneratedColumn<double>(
      'accuracy', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _speedMeta = const VerificationMeta('speed');
  @override
  late final GeneratedColumn<double> speed = GeneratedColumn<double>(
      'speed', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _batteryMeta =
      const VerificationMeta('battery');
  @override
  late final GeneratedColumn<int> battery = GeneratedColumn<int>(
      'battery', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _timestampMeta =
      const VerificationMeta('timestamp');
  @override
  late final GeneratedColumn<DateTime> timestamp = GeneratedColumn<DateTime>(
      'timestamp', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _syncedMeta = const VerificationMeta('synced');
  @override
  late final GeneratedColumn<bool> synced = GeneratedColumn<bool>(
      'synced', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("synced" IN (0, 1))'),
      defaultValue: const Constant(false));
  @override
  List<GeneratedColumn> get $columns =>
      [id, lat, lng, accuracy, speed, battery, timestamp, synced];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'gps_points';
  @override
  VerificationContext validateIntegrity(Insertable<GpsPointRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('lat')) {
      context.handle(
          _latMeta, lat.isAcceptableOrUnknown(data['lat']!, _latMeta));
    } else if (isInserting) {
      context.missing(_latMeta);
    }
    if (data.containsKey('lng')) {
      context.handle(
          _lngMeta, lng.isAcceptableOrUnknown(data['lng']!, _lngMeta));
    } else if (isInserting) {
      context.missing(_lngMeta);
    }
    if (data.containsKey('accuracy')) {
      context.handle(_accuracyMeta,
          accuracy.isAcceptableOrUnknown(data['accuracy']!, _accuracyMeta));
    }
    if (data.containsKey('speed')) {
      context.handle(
          _speedMeta, speed.isAcceptableOrUnknown(data['speed']!, _speedMeta));
    }
    if (data.containsKey('battery')) {
      context.handle(_batteryMeta,
          battery.isAcceptableOrUnknown(data['battery']!, _batteryMeta));
    }
    if (data.containsKey('timestamp')) {
      context.handle(_timestampMeta,
          timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta));
    } else if (isInserting) {
      context.missing(_timestampMeta);
    }
    if (data.containsKey('synced')) {
      context.handle(_syncedMeta,
          synced.isAcceptableOrUnknown(data['synced']!, _syncedMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  GpsPointRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return GpsPointRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      lat: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}lat'])!,
      lng: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}lng'])!,
      accuracy: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}accuracy']),
      speed: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}speed']),
      battery: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}battery']),
      timestamp: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}timestamp'])!,
      synced: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}synced'])!,
    );
  }

  @override
  $GpsPointsTable createAlias(String alias) {
    return $GpsPointsTable(attachedDatabase, alias);
  }
}

class GpsPointRow extends DataClass implements Insertable<GpsPointRow> {
  final int id;
  final double lat;
  final double lng;
  final double? accuracy;

  /// Скорость, м/с — по ней выбирается интервал отправки (в движении короче).
  final double? speed;

  /// Заряд батареи, %: в стеке устава нет плагина батареи, поле может быть `null`.
  final int? battery;

  /// Время фиксации точки (ISO в API, здесь — локальное время).
  final DateTime timestamp;

  /// Точка уже ушла на сервер.
  final bool synced;
  const GpsPointRow(
      {required this.id,
      required this.lat,
      required this.lng,
      this.accuracy,
      this.speed,
      this.battery,
      required this.timestamp,
      required this.synced});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['lat'] = Variable<double>(lat);
    map['lng'] = Variable<double>(lng);
    if (!nullToAbsent || accuracy != null) {
      map['accuracy'] = Variable<double>(accuracy);
    }
    if (!nullToAbsent || speed != null) {
      map['speed'] = Variable<double>(speed);
    }
    if (!nullToAbsent || battery != null) {
      map['battery'] = Variable<int>(battery);
    }
    map['timestamp'] = Variable<DateTime>(timestamp);
    map['synced'] = Variable<bool>(synced);
    return map;
  }

  GpsPointsCompanion toCompanion(bool nullToAbsent) {
    return GpsPointsCompanion(
      id: Value(id),
      lat: Value(lat),
      lng: Value(lng),
      accuracy: accuracy == null && nullToAbsent
          ? const Value.absent()
          : Value(accuracy),
      speed:
          speed == null && nullToAbsent ? const Value.absent() : Value(speed),
      battery: battery == null && nullToAbsent
          ? const Value.absent()
          : Value(battery),
      timestamp: Value(timestamp),
      synced: Value(synced),
    );
  }

  factory GpsPointRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return GpsPointRow(
      id: serializer.fromJson<int>(json['id']),
      lat: serializer.fromJson<double>(json['lat']),
      lng: serializer.fromJson<double>(json['lng']),
      accuracy: serializer.fromJson<double?>(json['accuracy']),
      speed: serializer.fromJson<double?>(json['speed']),
      battery: serializer.fromJson<int?>(json['battery']),
      timestamp: serializer.fromJson<DateTime>(json['timestamp']),
      synced: serializer.fromJson<bool>(json['synced']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'lat': serializer.toJson<double>(lat),
      'lng': serializer.toJson<double>(lng),
      'accuracy': serializer.toJson<double?>(accuracy),
      'speed': serializer.toJson<double?>(speed),
      'battery': serializer.toJson<int?>(battery),
      'timestamp': serializer.toJson<DateTime>(timestamp),
      'synced': serializer.toJson<bool>(synced),
    };
  }

  GpsPointRow copyWith(
          {int? id,
          double? lat,
          double? lng,
          Value<double?> accuracy = const Value.absent(),
          Value<double?> speed = const Value.absent(),
          Value<int?> battery = const Value.absent(),
          DateTime? timestamp,
          bool? synced}) =>
      GpsPointRow(
        id: id ?? this.id,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        accuracy: accuracy.present ? accuracy.value : this.accuracy,
        speed: speed.present ? speed.value : this.speed,
        battery: battery.present ? battery.value : this.battery,
        timestamp: timestamp ?? this.timestamp,
        synced: synced ?? this.synced,
      );
  GpsPointRow copyWithCompanion(GpsPointsCompanion data) {
    return GpsPointRow(
      id: data.id.present ? data.id.value : this.id,
      lat: data.lat.present ? data.lat.value : this.lat,
      lng: data.lng.present ? data.lng.value : this.lng,
      accuracy: data.accuracy.present ? data.accuracy.value : this.accuracy,
      speed: data.speed.present ? data.speed.value : this.speed,
      battery: data.battery.present ? data.battery.value : this.battery,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
      synced: data.synced.present ? data.synced.value : this.synced,
    );
  }

  @override
  String toString() {
    return (StringBuffer('GpsPointRow(')
          ..write('id: $id, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('accuracy: $accuracy, ')
          ..write('speed: $speed, ')
          ..write('battery: $battery, ')
          ..write('timestamp: $timestamp, ')
          ..write('synced: $synced')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, lat, lng, accuracy, speed, battery, timestamp, synced);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is GpsPointRow &&
          other.id == this.id &&
          other.lat == this.lat &&
          other.lng == this.lng &&
          other.accuracy == this.accuracy &&
          other.speed == this.speed &&
          other.battery == this.battery &&
          other.timestamp == this.timestamp &&
          other.synced == this.synced);
}

class GpsPointsCompanion extends UpdateCompanion<GpsPointRow> {
  final Value<int> id;
  final Value<double> lat;
  final Value<double> lng;
  final Value<double?> accuracy;
  final Value<double?> speed;
  final Value<int?> battery;
  final Value<DateTime> timestamp;
  final Value<bool> synced;
  const GpsPointsCompanion({
    this.id = const Value.absent(),
    this.lat = const Value.absent(),
    this.lng = const Value.absent(),
    this.accuracy = const Value.absent(),
    this.speed = const Value.absent(),
    this.battery = const Value.absent(),
    this.timestamp = const Value.absent(),
    this.synced = const Value.absent(),
  });
  GpsPointsCompanion.insert({
    this.id = const Value.absent(),
    required double lat,
    required double lng,
    this.accuracy = const Value.absent(),
    this.speed = const Value.absent(),
    this.battery = const Value.absent(),
    required DateTime timestamp,
    this.synced = const Value.absent(),
  })  : lat = Value(lat),
        lng = Value(lng),
        timestamp = Value(timestamp);
  static Insertable<GpsPointRow> custom({
    Expression<int>? id,
    Expression<double>? lat,
    Expression<double>? lng,
    Expression<double>? accuracy,
    Expression<double>? speed,
    Expression<int>? battery,
    Expression<DateTime>? timestamp,
    Expression<bool>? synced,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (accuracy != null) 'accuracy': accuracy,
      if (speed != null) 'speed': speed,
      if (battery != null) 'battery': battery,
      if (timestamp != null) 'timestamp': timestamp,
      if (synced != null) 'synced': synced,
    });
  }

  GpsPointsCompanion copyWith(
      {Value<int>? id,
      Value<double>? lat,
      Value<double>? lng,
      Value<double?>? accuracy,
      Value<double?>? speed,
      Value<int?>? battery,
      Value<DateTime>? timestamp,
      Value<bool>? synced}) {
    return GpsPointsCompanion(
      id: id ?? this.id,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      accuracy: accuracy ?? this.accuracy,
      speed: speed ?? this.speed,
      battery: battery ?? this.battery,
      timestamp: timestamp ?? this.timestamp,
      synced: synced ?? this.synced,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (lat.present) {
      map['lat'] = Variable<double>(lat.value);
    }
    if (lng.present) {
      map['lng'] = Variable<double>(lng.value);
    }
    if (accuracy.present) {
      map['accuracy'] = Variable<double>(accuracy.value);
    }
    if (speed.present) {
      map['speed'] = Variable<double>(speed.value);
    }
    if (battery.present) {
      map['battery'] = Variable<int>(battery.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<DateTime>(timestamp.value);
    }
    if (synced.present) {
      map['synced'] = Variable<bool>(synced.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('GpsPointsCompanion(')
          ..write('id: $id, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('accuracy: $accuracy, ')
          ..write('speed: $speed, ')
          ..write('battery: $battery, ')
          ..write('timestamp: $timestamp, ')
          ..write('synced: $synced')
          ..write(')'))
        .toString();
  }
}

class $ShiftEventsTable extends ShiftEvents
    with TableInfo<$ShiftEventsTable, ShiftEventRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShiftEventsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _scheduleIdMeta =
      const VerificationMeta('scheduleId');
  @override
  late final GeneratedColumn<String> scheduleId = GeneratedColumn<String>(
      'schedule_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _scheduleNameMeta =
      const VerificationMeta('scheduleName');
  @override
  late final GeneratedColumn<String> scheduleName = GeneratedColumn<String>(
      'schedule_name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _objectIdMeta =
      const VerificationMeta('objectId');
  @override
  late final GeneratedColumn<String> objectId = GeneratedColumn<String>(
      'object_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _routeIdMeta =
      const VerificationMeta('routeId');
  @override
  late final GeneratedColumn<String> routeId = GeneratedColumn<String>(
      'route_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<String> date = GeneratedColumn<String>(
      'date', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _plannedStartMeta =
      const VerificationMeta('plannedStart');
  @override
  late final GeneratedColumn<String> plannedStart = GeneratedColumn<String>(
      'planned_start', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _ticketIdMeta =
      const VerificationMeta('ticketId');
  @override
  late final GeneratedColumn<String> ticketId = GeneratedColumn<String>(
      'ticket_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _checkOutReasonMeta =
      const VerificationMeta('checkOutReason');
  @override
  late final GeneratedColumn<String> checkOutReason = GeneratedColumn<String>(
      'check_out_reason', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        scheduleId,
        scheduleName,
        objectId,
        routeId,
        date,
        plannedStart,
        status,
        ticketId,
        checkOutReason,
        updatedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shift_events';
  @override
  VerificationContext validateIntegrity(Insertable<ShiftEventRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('schedule_id')) {
      context.handle(
          _scheduleIdMeta,
          scheduleId.isAcceptableOrUnknown(
              data['schedule_id']!, _scheduleIdMeta));
    }
    if (data.containsKey('schedule_name')) {
      context.handle(
          _scheduleNameMeta,
          scheduleName.isAcceptableOrUnknown(
              data['schedule_name']!, _scheduleNameMeta));
    } else if (isInserting) {
      context.missing(_scheduleNameMeta);
    }
    if (data.containsKey('object_id')) {
      context.handle(_objectIdMeta,
          objectId.isAcceptableOrUnknown(data['object_id']!, _objectIdMeta));
    }
    if (data.containsKey('route_id')) {
      context.handle(_routeIdMeta,
          routeId.isAcceptableOrUnknown(data['route_id']!, _routeIdMeta));
    }
    if (data.containsKey('date')) {
      context.handle(
          _dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));
    }
    if (data.containsKey('planned_start')) {
      context.handle(
          _plannedStartMeta,
          plannedStart.isAcceptableOrUnknown(
              data['planned_start']!, _plannedStartMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('ticket_id')) {
      context.handle(_ticketIdMeta,
          ticketId.isAcceptableOrUnknown(data['ticket_id']!, _ticketIdMeta));
    }
    if (data.containsKey('check_out_reason')) {
      context.handle(
          _checkOutReasonMeta,
          checkOutReason.isAcceptableOrUnknown(
              data['check_out_reason']!, _checkOutReasonMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ShiftEventRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShiftEventRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      scheduleId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}schedule_id']),
      scheduleName: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}schedule_name'])!,
      objectId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}object_id']),
      routeId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}route_id']),
      date: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}date']),
      plannedStart: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}planned_start']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      ticketId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}ticket_id']),
      checkOutReason: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}check_out_reason']),
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $ShiftEventsTable createAlias(String alias) {
    return $ShiftEventsTable(attachedDatabase, alias);
  }
}

class ShiftEventRow extends DataClass implements Insertable<ShiftEventRow> {
  final String id;
  final String? scheduleId;
  final String scheduleName;
  final String? objectId;
  final String? routeId;
  final String? date;
  final String? plannedStart;
  final String status;
  final String? ticketId;
  final String? checkOutReason;
  final DateTime updatedAt;
  const ShiftEventRow(
      {required this.id,
      this.scheduleId,
      required this.scheduleName,
      this.objectId,
      this.routeId,
      this.date,
      this.plannedStart,
      required this.status,
      this.ticketId,
      this.checkOutReason,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || scheduleId != null) {
      map['schedule_id'] = Variable<String>(scheduleId);
    }
    map['schedule_name'] = Variable<String>(scheduleName);
    if (!nullToAbsent || objectId != null) {
      map['object_id'] = Variable<String>(objectId);
    }
    if (!nullToAbsent || routeId != null) {
      map['route_id'] = Variable<String>(routeId);
    }
    if (!nullToAbsent || date != null) {
      map['date'] = Variable<String>(date);
    }
    if (!nullToAbsent || plannedStart != null) {
      map['planned_start'] = Variable<String>(plannedStart);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || ticketId != null) {
      map['ticket_id'] = Variable<String>(ticketId);
    }
    if (!nullToAbsent || checkOutReason != null) {
      map['check_out_reason'] = Variable<String>(checkOutReason);
    }
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  ShiftEventsCompanion toCompanion(bool nullToAbsent) {
    return ShiftEventsCompanion(
      id: Value(id),
      scheduleId: scheduleId == null && nullToAbsent
          ? const Value.absent()
          : Value(scheduleId),
      scheduleName: Value(scheduleName),
      objectId: objectId == null && nullToAbsent
          ? const Value.absent()
          : Value(objectId),
      routeId: routeId == null && nullToAbsent
          ? const Value.absent()
          : Value(routeId),
      date: date == null && nullToAbsent ? const Value.absent() : Value(date),
      plannedStart: plannedStart == null && nullToAbsent
          ? const Value.absent()
          : Value(plannedStart),
      status: Value(status),
      ticketId: ticketId == null && nullToAbsent
          ? const Value.absent()
          : Value(ticketId),
      checkOutReason: checkOutReason == null && nullToAbsent
          ? const Value.absent()
          : Value(checkOutReason),
      updatedAt: Value(updatedAt),
    );
  }

  factory ShiftEventRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShiftEventRow(
      id: serializer.fromJson<String>(json['id']),
      scheduleId: serializer.fromJson<String?>(json['scheduleId']),
      scheduleName: serializer.fromJson<String>(json['scheduleName']),
      objectId: serializer.fromJson<String?>(json['objectId']),
      routeId: serializer.fromJson<String?>(json['routeId']),
      date: serializer.fromJson<String?>(json['date']),
      plannedStart: serializer.fromJson<String?>(json['plannedStart']),
      status: serializer.fromJson<String>(json['status']),
      ticketId: serializer.fromJson<String?>(json['ticketId']),
      checkOutReason: serializer.fromJson<String?>(json['checkOutReason']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'scheduleId': serializer.toJson<String?>(scheduleId),
      'scheduleName': serializer.toJson<String>(scheduleName),
      'objectId': serializer.toJson<String?>(objectId),
      'routeId': serializer.toJson<String?>(routeId),
      'date': serializer.toJson<String?>(date),
      'plannedStart': serializer.toJson<String?>(plannedStart),
      'status': serializer.toJson<String>(status),
      'ticketId': serializer.toJson<String?>(ticketId),
      'checkOutReason': serializer.toJson<String?>(checkOutReason),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  ShiftEventRow copyWith(
          {String? id,
          Value<String?> scheduleId = const Value.absent(),
          String? scheduleName,
          Value<String?> objectId = const Value.absent(),
          Value<String?> routeId = const Value.absent(),
          Value<String?> date = const Value.absent(),
          Value<String?> plannedStart = const Value.absent(),
          String? status,
          Value<String?> ticketId = const Value.absent(),
          Value<String?> checkOutReason = const Value.absent(),
          DateTime? updatedAt}) =>
      ShiftEventRow(
        id: id ?? this.id,
        scheduleId: scheduleId.present ? scheduleId.value : this.scheduleId,
        scheduleName: scheduleName ?? this.scheduleName,
        objectId: objectId.present ? objectId.value : this.objectId,
        routeId: routeId.present ? routeId.value : this.routeId,
        date: date.present ? date.value : this.date,
        plannedStart:
            plannedStart.present ? plannedStart.value : this.plannedStart,
        status: status ?? this.status,
        ticketId: ticketId.present ? ticketId.value : this.ticketId,
        checkOutReason:
            checkOutReason.present ? checkOutReason.value : this.checkOutReason,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  ShiftEventRow copyWithCompanion(ShiftEventsCompanion data) {
    return ShiftEventRow(
      id: data.id.present ? data.id.value : this.id,
      scheduleId:
          data.scheduleId.present ? data.scheduleId.value : this.scheduleId,
      scheduleName: data.scheduleName.present
          ? data.scheduleName.value
          : this.scheduleName,
      objectId: data.objectId.present ? data.objectId.value : this.objectId,
      routeId: data.routeId.present ? data.routeId.value : this.routeId,
      date: data.date.present ? data.date.value : this.date,
      plannedStart: data.plannedStart.present
          ? data.plannedStart.value
          : this.plannedStart,
      status: data.status.present ? data.status.value : this.status,
      ticketId: data.ticketId.present ? data.ticketId.value : this.ticketId,
      checkOutReason: data.checkOutReason.present
          ? data.checkOutReason.value
          : this.checkOutReason,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShiftEventRow(')
          ..write('id: $id, ')
          ..write('scheduleId: $scheduleId, ')
          ..write('scheduleName: $scheduleName, ')
          ..write('objectId: $objectId, ')
          ..write('routeId: $routeId, ')
          ..write('date: $date, ')
          ..write('plannedStart: $plannedStart, ')
          ..write('status: $status, ')
          ..write('ticketId: $ticketId, ')
          ..write('checkOutReason: $checkOutReason, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, scheduleId, scheduleName, objectId,
      routeId, date, plannedStart, status, ticketId, checkOutReason, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShiftEventRow &&
          other.id == this.id &&
          other.scheduleId == this.scheduleId &&
          other.scheduleName == this.scheduleName &&
          other.objectId == this.objectId &&
          other.routeId == this.routeId &&
          other.date == this.date &&
          other.plannedStart == this.plannedStart &&
          other.status == this.status &&
          other.ticketId == this.ticketId &&
          other.checkOutReason == this.checkOutReason &&
          other.updatedAt == this.updatedAt);
}

class ShiftEventsCompanion extends UpdateCompanion<ShiftEventRow> {
  final Value<String> id;
  final Value<String?> scheduleId;
  final Value<String> scheduleName;
  final Value<String?> objectId;
  final Value<String?> routeId;
  final Value<String?> date;
  final Value<String?> plannedStart;
  final Value<String> status;
  final Value<String?> ticketId;
  final Value<String?> checkOutReason;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const ShiftEventsCompanion({
    this.id = const Value.absent(),
    this.scheduleId = const Value.absent(),
    this.scheduleName = const Value.absent(),
    this.objectId = const Value.absent(),
    this.routeId = const Value.absent(),
    this.date = const Value.absent(),
    this.plannedStart = const Value.absent(),
    this.status = const Value.absent(),
    this.ticketId = const Value.absent(),
    this.checkOutReason = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShiftEventsCompanion.insert({
    required String id,
    this.scheduleId = const Value.absent(),
    required String scheduleName,
    this.objectId = const Value.absent(),
    this.routeId = const Value.absent(),
    this.date = const Value.absent(),
    this.plannedStart = const Value.absent(),
    required String status,
    this.ticketId = const Value.absent(),
    this.checkOutReason = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        scheduleName = Value(scheduleName),
        status = Value(status),
        updatedAt = Value(updatedAt);
  static Insertable<ShiftEventRow> custom({
    Expression<String>? id,
    Expression<String>? scheduleId,
    Expression<String>? scheduleName,
    Expression<String>? objectId,
    Expression<String>? routeId,
    Expression<String>? date,
    Expression<String>? plannedStart,
    Expression<String>? status,
    Expression<String>? ticketId,
    Expression<String>? checkOutReason,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (scheduleId != null) 'schedule_id': scheduleId,
      if (scheduleName != null) 'schedule_name': scheduleName,
      if (objectId != null) 'object_id': objectId,
      if (routeId != null) 'route_id': routeId,
      if (date != null) 'date': date,
      if (plannedStart != null) 'planned_start': plannedStart,
      if (status != null) 'status': status,
      if (ticketId != null) 'ticket_id': ticketId,
      if (checkOutReason != null) 'check_out_reason': checkOutReason,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShiftEventsCompanion copyWith(
      {Value<String>? id,
      Value<String?>? scheduleId,
      Value<String>? scheduleName,
      Value<String?>? objectId,
      Value<String?>? routeId,
      Value<String?>? date,
      Value<String?>? plannedStart,
      Value<String>? status,
      Value<String?>? ticketId,
      Value<String?>? checkOutReason,
      Value<DateTime>? updatedAt,
      Value<int>? rowid}) {
    return ShiftEventsCompanion(
      id: id ?? this.id,
      scheduleId: scheduleId ?? this.scheduleId,
      scheduleName: scheduleName ?? this.scheduleName,
      objectId: objectId ?? this.objectId,
      routeId: routeId ?? this.routeId,
      date: date ?? this.date,
      plannedStart: plannedStart ?? this.plannedStart,
      status: status ?? this.status,
      ticketId: ticketId ?? this.ticketId,
      checkOutReason: checkOutReason ?? this.checkOutReason,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (scheduleId.present) {
      map['schedule_id'] = Variable<String>(scheduleId.value);
    }
    if (scheduleName.present) {
      map['schedule_name'] = Variable<String>(scheduleName.value);
    }
    if (objectId.present) {
      map['object_id'] = Variable<String>(objectId.value);
    }
    if (routeId.present) {
      map['route_id'] = Variable<String>(routeId.value);
    }
    if (date.present) {
      map['date'] = Variable<String>(date.value);
    }
    if (plannedStart.present) {
      map['planned_start'] = Variable<String>(plannedStart.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (ticketId.present) {
      map['ticket_id'] = Variable<String>(ticketId.value);
    }
    if (checkOutReason.present) {
      map['check_out_reason'] = Variable<String>(checkOutReason.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShiftEventsCompanion(')
          ..write('id: $id, ')
          ..write('scheduleId: $scheduleId, ')
          ..write('scheduleName: $scheduleName, ')
          ..write('objectId: $objectId, ')
          ..write('routeId: $routeId, ')
          ..write('date: $date, ')
          ..write('plannedStart: $plannedStart, ')
          ..write('status: $status, ')
          ..write('ticketId: $ticketId, ')
          ..write('checkOutReason: $checkOutReason, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedObjectsTable extends CachedObjects
    with TableInfo<$CachedObjectsTable, CachedObjectRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedObjectsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _addressMeta =
      const VerificationMeta('address');
  @override
  late final GeneratedColumn<String> address = GeneratedColumn<String>(
      'address', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _latMeta = const VerificationMeta('lat');
  @override
  late final GeneratedColumn<double> lat = GeneratedColumn<double>(
      'lat', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _lngMeta = const VerificationMeta('lng');
  @override
  late final GeneratedColumn<double> lng = GeneratedColumn<double>(
      'lng', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, name, address, lat, lng, status, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_objects';
  @override
  VerificationContext validateIntegrity(Insertable<CachedObjectRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('address')) {
      context.handle(_addressMeta,
          address.isAcceptableOrUnknown(data['address']!, _addressMeta));
    }
    if (data.containsKey('lat')) {
      context.handle(
          _latMeta, lat.isAcceptableOrUnknown(data['lat']!, _latMeta));
    }
    if (data.containsKey('lng')) {
      context.handle(
          _lngMeta, lng.isAcceptableOrUnknown(data['lng']!, _lngMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedObjectRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedObjectRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      address: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}address']),
      lat: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}lat']),
      lng: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}lng']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status']),
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $CachedObjectsTable createAlias(String alias) {
    return $CachedObjectsTable(attachedDatabase, alias);
  }
}

class CachedObjectRow extends DataClass implements Insertable<CachedObjectRow> {
  final String id;
  final String name;
  final String? address;
  final double? lat;
  final double? lng;
  final String? status;
  final DateTime updatedAt;
  const CachedObjectRow(
      {required this.id,
      required this.name,
      this.address,
      this.lat,
      this.lng,
      this.status,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || address != null) {
      map['address'] = Variable<String>(address);
    }
    if (!nullToAbsent || lat != null) {
      map['lat'] = Variable<double>(lat);
    }
    if (!nullToAbsent || lng != null) {
      map['lng'] = Variable<double>(lng);
    }
    if (!nullToAbsent || status != null) {
      map['status'] = Variable<String>(status);
    }
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  CachedObjectsCompanion toCompanion(bool nullToAbsent) {
    return CachedObjectsCompanion(
      id: Value(id),
      name: Value(name),
      address: address == null && nullToAbsent
          ? const Value.absent()
          : Value(address),
      lat: lat == null && nullToAbsent ? const Value.absent() : Value(lat),
      lng: lng == null && nullToAbsent ? const Value.absent() : Value(lng),
      status:
          status == null && nullToAbsent ? const Value.absent() : Value(status),
      updatedAt: Value(updatedAt),
    );
  }

  factory CachedObjectRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedObjectRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      address: serializer.fromJson<String?>(json['address']),
      lat: serializer.fromJson<double?>(json['lat']),
      lng: serializer.fromJson<double?>(json['lng']),
      status: serializer.fromJson<String?>(json['status']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'address': serializer.toJson<String?>(address),
      'lat': serializer.toJson<double?>(lat),
      'lng': serializer.toJson<double?>(lng),
      'status': serializer.toJson<String?>(status),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  CachedObjectRow copyWith(
          {String? id,
          String? name,
          Value<String?> address = const Value.absent(),
          Value<double?> lat = const Value.absent(),
          Value<double?> lng = const Value.absent(),
          Value<String?> status = const Value.absent(),
          DateTime? updatedAt}) =>
      CachedObjectRow(
        id: id ?? this.id,
        name: name ?? this.name,
        address: address.present ? address.value : this.address,
        lat: lat.present ? lat.value : this.lat,
        lng: lng.present ? lng.value : this.lng,
        status: status.present ? status.value : this.status,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  CachedObjectRow copyWithCompanion(CachedObjectsCompanion data) {
    return CachedObjectRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      address: data.address.present ? data.address.value : this.address,
      lat: data.lat.present ? data.lat.value : this.lat,
      lng: data.lng.present ? data.lng.value : this.lng,
      status: data.status.present ? data.status.value : this.status,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedObjectRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('address: $address, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('status: $status, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, address, lat, lng, status, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedObjectRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.address == this.address &&
          other.lat == this.lat &&
          other.lng == this.lng &&
          other.status == this.status &&
          other.updatedAt == this.updatedAt);
}

class CachedObjectsCompanion extends UpdateCompanion<CachedObjectRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String?> address;
  final Value<double?> lat;
  final Value<double?> lng;
  final Value<String?> status;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const CachedObjectsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.address = const Value.absent(),
    this.lat = const Value.absent(),
    this.lng = const Value.absent(),
    this.status = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedObjectsCompanion.insert({
    required String id,
    required String name,
    this.address = const Value.absent(),
    this.lat = const Value.absent(),
    this.lng = const Value.absent(),
    this.status = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        name = Value(name),
        updatedAt = Value(updatedAt);
  static Insertable<CachedObjectRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? address,
    Expression<double>? lat,
    Expression<double>? lng,
    Expression<String>? status,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (address != null) 'address': address,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (status != null) 'status': status,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedObjectsCompanion copyWith(
      {Value<String>? id,
      Value<String>? name,
      Value<String?>? address,
      Value<double?>? lat,
      Value<double?>? lng,
      Value<String?>? status,
      Value<DateTime>? updatedAt,
      Value<int>? rowid}) {
    return CachedObjectsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      address: address ?? this.address,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      status: status ?? this.status,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (address.present) {
      map['address'] = Variable<String>(address.value);
    }
    if (lat.present) {
      map['lat'] = Variable<double>(lat.value);
    }
    if (lng.present) {
      map['lng'] = Variable<double>(lng.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedObjectsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('address: $address, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('status: $status, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RoutePointsTable extends RoutePoints
    with TableInfo<$RoutePointsTable, RoutePointRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RoutePointsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _pointIdMeta =
      const VerificationMeta('pointId');
  @override
  late final GeneratedColumn<String> pointId = GeneratedColumn<String>(
      'point_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _eventIdMeta =
      const VerificationMeta('eventId');
  @override
  late final GeneratedColumn<String> eventId = GeneratedColumn<String>(
      'event_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _routeIdMeta =
      const VerificationMeta('routeId');
  @override
  late final GeneratedColumn<String> routeId = GeneratedColumn<String>(
      'route_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _roomIdMeta = const VerificationMeta('roomId');
  @override
  late final GeneratedColumn<String> roomId = GeneratedColumn<String>(
      'room_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _orderIndexMeta =
      const VerificationMeta('orderIndex');
  @override
  late final GeneratedColumn<int> orderIndex = GeneratedColumn<int>(
      'order_index', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _estimatedTimeMinMeta =
      const VerificationMeta('estimatedTimeMin');
  @override
  late final GeneratedColumn<int> estimatedTimeMin = GeneratedColumn<int>(
      'estimated_time_min', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('pending'));
  static const VerificationMeta _skippedReasonMeta =
      const VerificationMeta('skippedReason');
  @override
  late final GeneratedColumn<String> skippedReason = GeneratedColumn<String>(
      'skipped_reason', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _completedAtLocalMeta =
      const VerificationMeta('completedAtLocal');
  @override
  late final GeneratedColumn<DateTime> completedAtLocal =
      GeneratedColumn<DateTime>('completed_at_local', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        pointId,
        eventId,
        routeId,
        roomId,
        orderIndex,
        estimatedTimeMin,
        status,
        skippedReason,
        completedAtLocal
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'route_points';
  @override
  VerificationContext validateIntegrity(Insertable<RoutePointRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('point_id')) {
      context.handle(_pointIdMeta,
          pointId.isAcceptableOrUnknown(data['point_id']!, _pointIdMeta));
    } else if (isInserting) {
      context.missing(_pointIdMeta);
    }
    if (data.containsKey('event_id')) {
      context.handle(_eventIdMeta,
          eventId.isAcceptableOrUnknown(data['event_id']!, _eventIdMeta));
    } else if (isInserting) {
      context.missing(_eventIdMeta);
    }
    if (data.containsKey('route_id')) {
      context.handle(_routeIdMeta,
          routeId.isAcceptableOrUnknown(data['route_id']!, _routeIdMeta));
    } else if (isInserting) {
      context.missing(_routeIdMeta);
    }
    if (data.containsKey('room_id')) {
      context.handle(_roomIdMeta,
          roomId.isAcceptableOrUnknown(data['room_id']!, _roomIdMeta));
    } else if (isInserting) {
      context.missing(_roomIdMeta);
    }
    if (data.containsKey('order_index')) {
      context.handle(
          _orderIndexMeta,
          orderIndex.isAcceptableOrUnknown(
              data['order_index']!, _orderIndexMeta));
    }
    if (data.containsKey('estimated_time_min')) {
      context.handle(
          _estimatedTimeMinMeta,
          estimatedTimeMin.isAcceptableOrUnknown(
              data['estimated_time_min']!, _estimatedTimeMinMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('skipped_reason')) {
      context.handle(
          _skippedReasonMeta,
          skippedReason.isAcceptableOrUnknown(
              data['skipped_reason']!, _skippedReasonMeta));
    }
    if (data.containsKey('completed_at_local')) {
      context.handle(
          _completedAtLocalMeta,
          completedAtLocal.isAcceptableOrUnknown(
              data['completed_at_local']!, _completedAtLocalMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {pointId};
  @override
  RoutePointRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RoutePointRow(
      pointId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}point_id'])!,
      eventId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}event_id'])!,
      routeId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}route_id'])!,
      roomId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}room_id'])!,
      orderIndex: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}order_index'])!,
      estimatedTimeMin: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}estimated_time_min']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      skippedReason: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}skipped_reason']),
      completedAtLocal: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}completed_at_local']),
    );
  }

  @override
  $RoutePointsTable createAlias(String alias) {
    return $RoutePointsTable(attachedDatabase, alias);
  }
}

class RoutePointRow extends DataClass implements Insertable<RoutePointRow> {
  final String pointId;
  final String eventId;
  final String routeId;
  final String roomId;
  final int orderIndex;
  final int? estimatedTimeMin;

  /// `pending` | `active` | `done` | `skipped`.
  final String status;
  final String? skippedReason;
  final DateTime? completedAtLocal;
  const RoutePointRow(
      {required this.pointId,
      required this.eventId,
      required this.routeId,
      required this.roomId,
      required this.orderIndex,
      this.estimatedTimeMin,
      required this.status,
      this.skippedReason,
      this.completedAtLocal});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['point_id'] = Variable<String>(pointId);
    map['event_id'] = Variable<String>(eventId);
    map['route_id'] = Variable<String>(routeId);
    map['room_id'] = Variable<String>(roomId);
    map['order_index'] = Variable<int>(orderIndex);
    if (!nullToAbsent || estimatedTimeMin != null) {
      map['estimated_time_min'] = Variable<int>(estimatedTimeMin);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || skippedReason != null) {
      map['skipped_reason'] = Variable<String>(skippedReason);
    }
    if (!nullToAbsent || completedAtLocal != null) {
      map['completed_at_local'] = Variable<DateTime>(completedAtLocal);
    }
    return map;
  }

  RoutePointsCompanion toCompanion(bool nullToAbsent) {
    return RoutePointsCompanion(
      pointId: Value(pointId),
      eventId: Value(eventId),
      routeId: Value(routeId),
      roomId: Value(roomId),
      orderIndex: Value(orderIndex),
      estimatedTimeMin: estimatedTimeMin == null && nullToAbsent
          ? const Value.absent()
          : Value(estimatedTimeMin),
      status: Value(status),
      skippedReason: skippedReason == null && nullToAbsent
          ? const Value.absent()
          : Value(skippedReason),
      completedAtLocal: completedAtLocal == null && nullToAbsent
          ? const Value.absent()
          : Value(completedAtLocal),
    );
  }

  factory RoutePointRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RoutePointRow(
      pointId: serializer.fromJson<String>(json['pointId']),
      eventId: serializer.fromJson<String>(json['eventId']),
      routeId: serializer.fromJson<String>(json['routeId']),
      roomId: serializer.fromJson<String>(json['roomId']),
      orderIndex: serializer.fromJson<int>(json['orderIndex']),
      estimatedTimeMin: serializer.fromJson<int?>(json['estimatedTimeMin']),
      status: serializer.fromJson<String>(json['status']),
      skippedReason: serializer.fromJson<String?>(json['skippedReason']),
      completedAtLocal:
          serializer.fromJson<DateTime?>(json['completedAtLocal']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'pointId': serializer.toJson<String>(pointId),
      'eventId': serializer.toJson<String>(eventId),
      'routeId': serializer.toJson<String>(routeId),
      'roomId': serializer.toJson<String>(roomId),
      'orderIndex': serializer.toJson<int>(orderIndex),
      'estimatedTimeMin': serializer.toJson<int?>(estimatedTimeMin),
      'status': serializer.toJson<String>(status),
      'skippedReason': serializer.toJson<String?>(skippedReason),
      'completedAtLocal': serializer.toJson<DateTime?>(completedAtLocal),
    };
  }

  RoutePointRow copyWith(
          {String? pointId,
          String? eventId,
          String? routeId,
          String? roomId,
          int? orderIndex,
          Value<int?> estimatedTimeMin = const Value.absent(),
          String? status,
          Value<String?> skippedReason = const Value.absent(),
          Value<DateTime?> completedAtLocal = const Value.absent()}) =>
      RoutePointRow(
        pointId: pointId ?? this.pointId,
        eventId: eventId ?? this.eventId,
        routeId: routeId ?? this.routeId,
        roomId: roomId ?? this.roomId,
        orderIndex: orderIndex ?? this.orderIndex,
        estimatedTimeMin: estimatedTimeMin.present
            ? estimatedTimeMin.value
            : this.estimatedTimeMin,
        status: status ?? this.status,
        skippedReason:
            skippedReason.present ? skippedReason.value : this.skippedReason,
        completedAtLocal: completedAtLocal.present
            ? completedAtLocal.value
            : this.completedAtLocal,
      );
  RoutePointRow copyWithCompanion(RoutePointsCompanion data) {
    return RoutePointRow(
      pointId: data.pointId.present ? data.pointId.value : this.pointId,
      eventId: data.eventId.present ? data.eventId.value : this.eventId,
      routeId: data.routeId.present ? data.routeId.value : this.routeId,
      roomId: data.roomId.present ? data.roomId.value : this.roomId,
      orderIndex:
          data.orderIndex.present ? data.orderIndex.value : this.orderIndex,
      estimatedTimeMin: data.estimatedTimeMin.present
          ? data.estimatedTimeMin.value
          : this.estimatedTimeMin,
      status: data.status.present ? data.status.value : this.status,
      skippedReason: data.skippedReason.present
          ? data.skippedReason.value
          : this.skippedReason,
      completedAtLocal: data.completedAtLocal.present
          ? data.completedAtLocal.value
          : this.completedAtLocal,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RoutePointRow(')
          ..write('pointId: $pointId, ')
          ..write('eventId: $eventId, ')
          ..write('routeId: $routeId, ')
          ..write('roomId: $roomId, ')
          ..write('orderIndex: $orderIndex, ')
          ..write('estimatedTimeMin: $estimatedTimeMin, ')
          ..write('status: $status, ')
          ..write('skippedReason: $skippedReason, ')
          ..write('completedAtLocal: $completedAtLocal')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(pointId, eventId, routeId, roomId, orderIndex,
      estimatedTimeMin, status, skippedReason, completedAtLocal);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RoutePointRow &&
          other.pointId == this.pointId &&
          other.eventId == this.eventId &&
          other.routeId == this.routeId &&
          other.roomId == this.roomId &&
          other.orderIndex == this.orderIndex &&
          other.estimatedTimeMin == this.estimatedTimeMin &&
          other.status == this.status &&
          other.skippedReason == this.skippedReason &&
          other.completedAtLocal == this.completedAtLocal);
}

class RoutePointsCompanion extends UpdateCompanion<RoutePointRow> {
  final Value<String> pointId;
  final Value<String> eventId;
  final Value<String> routeId;
  final Value<String> roomId;
  final Value<int> orderIndex;
  final Value<int?> estimatedTimeMin;
  final Value<String> status;
  final Value<String?> skippedReason;
  final Value<DateTime?> completedAtLocal;
  final Value<int> rowid;
  const RoutePointsCompanion({
    this.pointId = const Value.absent(),
    this.eventId = const Value.absent(),
    this.routeId = const Value.absent(),
    this.roomId = const Value.absent(),
    this.orderIndex = const Value.absent(),
    this.estimatedTimeMin = const Value.absent(),
    this.status = const Value.absent(),
    this.skippedReason = const Value.absent(),
    this.completedAtLocal = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RoutePointsCompanion.insert({
    required String pointId,
    required String eventId,
    required String routeId,
    required String roomId,
    this.orderIndex = const Value.absent(),
    this.estimatedTimeMin = const Value.absent(),
    this.status = const Value.absent(),
    this.skippedReason = const Value.absent(),
    this.completedAtLocal = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : pointId = Value(pointId),
        eventId = Value(eventId),
        routeId = Value(routeId),
        roomId = Value(roomId);
  static Insertable<RoutePointRow> custom({
    Expression<String>? pointId,
    Expression<String>? eventId,
    Expression<String>? routeId,
    Expression<String>? roomId,
    Expression<int>? orderIndex,
    Expression<int>? estimatedTimeMin,
    Expression<String>? status,
    Expression<String>? skippedReason,
    Expression<DateTime>? completedAtLocal,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (pointId != null) 'point_id': pointId,
      if (eventId != null) 'event_id': eventId,
      if (routeId != null) 'route_id': routeId,
      if (roomId != null) 'room_id': roomId,
      if (orderIndex != null) 'order_index': orderIndex,
      if (estimatedTimeMin != null) 'estimated_time_min': estimatedTimeMin,
      if (status != null) 'status': status,
      if (skippedReason != null) 'skipped_reason': skippedReason,
      if (completedAtLocal != null) 'completed_at_local': completedAtLocal,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RoutePointsCompanion copyWith(
      {Value<String>? pointId,
      Value<String>? eventId,
      Value<String>? routeId,
      Value<String>? roomId,
      Value<int>? orderIndex,
      Value<int?>? estimatedTimeMin,
      Value<String>? status,
      Value<String?>? skippedReason,
      Value<DateTime?>? completedAtLocal,
      Value<int>? rowid}) {
    return RoutePointsCompanion(
      pointId: pointId ?? this.pointId,
      eventId: eventId ?? this.eventId,
      routeId: routeId ?? this.routeId,
      roomId: roomId ?? this.roomId,
      orderIndex: orderIndex ?? this.orderIndex,
      estimatedTimeMin: estimatedTimeMin ?? this.estimatedTimeMin,
      status: status ?? this.status,
      skippedReason: skippedReason ?? this.skippedReason,
      completedAtLocal: completedAtLocal ?? this.completedAtLocal,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (pointId.present) {
      map['point_id'] = Variable<String>(pointId.value);
    }
    if (eventId.present) {
      map['event_id'] = Variable<String>(eventId.value);
    }
    if (routeId.present) {
      map['route_id'] = Variable<String>(routeId.value);
    }
    if (roomId.present) {
      map['room_id'] = Variable<String>(roomId.value);
    }
    if (orderIndex.present) {
      map['order_index'] = Variable<int>(orderIndex.value);
    }
    if (estimatedTimeMin.present) {
      map['estimated_time_min'] = Variable<int>(estimatedTimeMin.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (skippedReason.present) {
      map['skipped_reason'] = Variable<String>(skippedReason.value);
    }
    if (completedAtLocal.present) {
      map['completed_at_local'] = Variable<DateTime>(completedAtLocal.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RoutePointsCompanion(')
          ..write('pointId: $pointId, ')
          ..write('eventId: $eventId, ')
          ..write('routeId: $routeId, ')
          ..write('roomId: $roomId, ')
          ..write('orderIndex: $orderIndex, ')
          ..write('estimatedTimeMin: $estimatedTimeMin, ')
          ..write('status: $status, ')
          ..write('skippedReason: $skippedReason, ')
          ..write('completedAtLocal: $completedAtLocal, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChecklistOperationsTable extends ChecklistOperations
    with TableInfo<$ChecklistOperationsTable, ChecklistOperationRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChecklistOperationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _operationIdMeta =
      const VerificationMeta('operationId');
  @override
  late final GeneratedColumn<String> operationId = GeneratedColumn<String>(
      'operation_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _roomIdMeta = const VerificationMeta('roomId');
  @override
  late final GeneratedColumn<String> roomId = GeneratedColumn<String>(
      'room_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _ticketIdMeta =
      const VerificationMeta('ticketId');
  @override
  late final GeneratedColumn<String> ticketId = GeneratedColumn<String>(
      'ticket_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _orderIndexMeta =
      const VerificationMeta('orderIndex');
  @override
  late final GeneratedColumn<int> orderIndex = GeneratedColumn<int>(
      'order_index', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _descriptionMeta =
      const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
      'description', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _equipmentJsonMeta =
      const VerificationMeta('equipmentJson');
  @override
  late final GeneratedColumn<String> equipmentJson = GeneratedColumn<String>(
      'equipment_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _estimatedTimeMinMeta =
      const VerificationMeta('estimatedTimeMin');
  @override
  late final GeneratedColumn<int> estimatedTimeMin = GeneratedColumn<int>(
      'estimated_time_min', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _requiresPhotoMeta =
      const VerificationMeta('requiresPhoto');
  @override
  late final GeneratedColumn<bool> requiresPhoto = GeneratedColumn<bool>(
      'requires_photo', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("requires_photo" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _requiresQrMeta =
      const VerificationMeta('requiresQr');
  @override
  late final GeneratedColumn<bool> requiresQr = GeneratedColumn<bool>(
      'requires_qr', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("requires_qr" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _startedAtLocalMeta =
      const VerificationMeta('startedAtLocal');
  @override
  late final GeneratedColumn<DateTime> startedAtLocal =
      GeneratedColumn<DateTime>('started_at_local', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _completedAtLocalMeta =
      const VerificationMeta('completedAtLocal');
  @override
  late final GeneratedColumn<DateTime> completedAtLocal =
      GeneratedColumn<DateTime>('completed_at_local', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _photoLocalPathMeta =
      const VerificationMeta('photoLocalPath');
  @override
  late final GeneratedColumn<String> photoLocalPath = GeneratedColumn<String>(
      'photo_local_path', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _photoFileIdMeta =
      const VerificationMeta('photoFileId');
  @override
  late final GeneratedColumn<String> photoFileId = GeneratedColumn<String>(
      'photo_file_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _photoUrlMeta =
      const VerificationMeta('photoUrl');
  @override
  late final GeneratedColumn<String> photoUrl = GeneratedColumn<String>(
      'photo_url', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _syncStatusMeta =
      const VerificationMeta('syncStatus');
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
      'sync_status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('pending'));
  @override
  List<GeneratedColumn> get $columns => [
        operationId,
        roomId,
        ticketId,
        orderIndex,
        name,
        description,
        equipmentJson,
        estimatedTimeMin,
        requiresPhoto,
        requiresQr,
        startedAtLocal,
        completedAtLocal,
        photoLocalPath,
        photoFileId,
        photoUrl,
        syncStatus
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'checklist_operations';
  @override
  VerificationContext validateIntegrity(
      Insertable<ChecklistOperationRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('operation_id')) {
      context.handle(
          _operationIdMeta,
          operationId.isAcceptableOrUnknown(
              data['operation_id']!, _operationIdMeta));
    } else if (isInserting) {
      context.missing(_operationIdMeta);
    }
    if (data.containsKey('room_id')) {
      context.handle(_roomIdMeta,
          roomId.isAcceptableOrUnknown(data['room_id']!, _roomIdMeta));
    } else if (isInserting) {
      context.missing(_roomIdMeta);
    }
    if (data.containsKey('ticket_id')) {
      context.handle(_ticketIdMeta,
          ticketId.isAcceptableOrUnknown(data['ticket_id']!, _ticketIdMeta));
    }
    if (data.containsKey('order_index')) {
      context.handle(
          _orderIndexMeta,
          orderIndex.isAcceptableOrUnknown(
              data['order_index']!, _orderIndexMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('description')) {
      context.handle(
          _descriptionMeta,
          description.isAcceptableOrUnknown(
              data['description']!, _descriptionMeta));
    }
    if (data.containsKey('equipment_json')) {
      context.handle(
          _equipmentJsonMeta,
          equipmentJson.isAcceptableOrUnknown(
              data['equipment_json']!, _equipmentJsonMeta));
    }
    if (data.containsKey('estimated_time_min')) {
      context.handle(
          _estimatedTimeMinMeta,
          estimatedTimeMin.isAcceptableOrUnknown(
              data['estimated_time_min']!, _estimatedTimeMinMeta));
    }
    if (data.containsKey('requires_photo')) {
      context.handle(
          _requiresPhotoMeta,
          requiresPhoto.isAcceptableOrUnknown(
              data['requires_photo']!, _requiresPhotoMeta));
    }
    if (data.containsKey('requires_qr')) {
      context.handle(
          _requiresQrMeta,
          requiresQr.isAcceptableOrUnknown(
              data['requires_qr']!, _requiresQrMeta));
    }
    if (data.containsKey('started_at_local')) {
      context.handle(
          _startedAtLocalMeta,
          startedAtLocal.isAcceptableOrUnknown(
              data['started_at_local']!, _startedAtLocalMeta));
    }
    if (data.containsKey('completed_at_local')) {
      context.handle(
          _completedAtLocalMeta,
          completedAtLocal.isAcceptableOrUnknown(
              data['completed_at_local']!, _completedAtLocalMeta));
    }
    if (data.containsKey('photo_local_path')) {
      context.handle(
          _photoLocalPathMeta,
          photoLocalPath.isAcceptableOrUnknown(
              data['photo_local_path']!, _photoLocalPathMeta));
    }
    if (data.containsKey('photo_file_id')) {
      context.handle(
          _photoFileIdMeta,
          photoFileId.isAcceptableOrUnknown(
              data['photo_file_id']!, _photoFileIdMeta));
    }
    if (data.containsKey('photo_url')) {
      context.handle(_photoUrlMeta,
          photoUrl.isAcceptableOrUnknown(data['photo_url']!, _photoUrlMeta));
    }
    if (data.containsKey('sync_status')) {
      context.handle(
          _syncStatusMeta,
          syncStatus.isAcceptableOrUnknown(
              data['sync_status']!, _syncStatusMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {operationId};
  @override
  ChecklistOperationRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChecklistOperationRow(
      operationId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}operation_id'])!,
      roomId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}room_id'])!,
      ticketId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}ticket_id']),
      orderIndex: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}order_index'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      description: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}description']),
      equipmentJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}equipment_json']),
      estimatedTimeMin: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}estimated_time_min']),
      requiresPhoto: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}requires_photo'])!,
      requiresQr: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}requires_qr'])!,
      startedAtLocal: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}started_at_local']),
      completedAtLocal: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}completed_at_local']),
      photoLocalPath: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}photo_local_path']),
      photoFileId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}photo_file_id']),
      photoUrl: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}photo_url']),
      syncStatus: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sync_status'])!,
    );
  }

  @override
  $ChecklistOperationsTable createAlias(String alias) {
    return $ChecklistOperationsTable(attachedDatabase, alias);
  }
}

class ChecklistOperationRow extends DataClass
    implements Insertable<ChecklistOperationRow> {
  final String operationId;
  final String roomId;
  final String? ticketId;
  final int orderIndex;
  final String name;
  final String? description;
  final String? equipmentJson;
  final int? estimatedTimeMin;
  final bool requiresPhoto;
  final bool requiresQr;
  final DateTime? startedAtLocal;
  final DateTime? completedAtLocal;
  final String? photoLocalPath;
  final String? photoFileId;
  final String? photoUrl;

  /// Локальный статус операции: `pending` | `active` | `completed` | `queued`.
  final String syncStatus;
  const ChecklistOperationRow(
      {required this.operationId,
      required this.roomId,
      this.ticketId,
      required this.orderIndex,
      required this.name,
      this.description,
      this.equipmentJson,
      this.estimatedTimeMin,
      required this.requiresPhoto,
      required this.requiresQr,
      this.startedAtLocal,
      this.completedAtLocal,
      this.photoLocalPath,
      this.photoFileId,
      this.photoUrl,
      required this.syncStatus});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['operation_id'] = Variable<String>(operationId);
    map['room_id'] = Variable<String>(roomId);
    if (!nullToAbsent || ticketId != null) {
      map['ticket_id'] = Variable<String>(ticketId);
    }
    map['order_index'] = Variable<int>(orderIndex);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || description != null) {
      map['description'] = Variable<String>(description);
    }
    if (!nullToAbsent || equipmentJson != null) {
      map['equipment_json'] = Variable<String>(equipmentJson);
    }
    if (!nullToAbsent || estimatedTimeMin != null) {
      map['estimated_time_min'] = Variable<int>(estimatedTimeMin);
    }
    map['requires_photo'] = Variable<bool>(requiresPhoto);
    map['requires_qr'] = Variable<bool>(requiresQr);
    if (!nullToAbsent || startedAtLocal != null) {
      map['started_at_local'] = Variable<DateTime>(startedAtLocal);
    }
    if (!nullToAbsent || completedAtLocal != null) {
      map['completed_at_local'] = Variable<DateTime>(completedAtLocal);
    }
    if (!nullToAbsent || photoLocalPath != null) {
      map['photo_local_path'] = Variable<String>(photoLocalPath);
    }
    if (!nullToAbsent || photoFileId != null) {
      map['photo_file_id'] = Variable<String>(photoFileId);
    }
    if (!nullToAbsent || photoUrl != null) {
      map['photo_url'] = Variable<String>(photoUrl);
    }
    map['sync_status'] = Variable<String>(syncStatus);
    return map;
  }

  ChecklistOperationsCompanion toCompanion(bool nullToAbsent) {
    return ChecklistOperationsCompanion(
      operationId: Value(operationId),
      roomId: Value(roomId),
      ticketId: ticketId == null && nullToAbsent
          ? const Value.absent()
          : Value(ticketId),
      orderIndex: Value(orderIndex),
      name: Value(name),
      description: description == null && nullToAbsent
          ? const Value.absent()
          : Value(description),
      equipmentJson: equipmentJson == null && nullToAbsent
          ? const Value.absent()
          : Value(equipmentJson),
      estimatedTimeMin: estimatedTimeMin == null && nullToAbsent
          ? const Value.absent()
          : Value(estimatedTimeMin),
      requiresPhoto: Value(requiresPhoto),
      requiresQr: Value(requiresQr),
      startedAtLocal: startedAtLocal == null && nullToAbsent
          ? const Value.absent()
          : Value(startedAtLocal),
      completedAtLocal: completedAtLocal == null && nullToAbsent
          ? const Value.absent()
          : Value(completedAtLocal),
      photoLocalPath: photoLocalPath == null && nullToAbsent
          ? const Value.absent()
          : Value(photoLocalPath),
      photoFileId: photoFileId == null && nullToAbsent
          ? const Value.absent()
          : Value(photoFileId),
      photoUrl: photoUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(photoUrl),
      syncStatus: Value(syncStatus),
    );
  }

  factory ChecklistOperationRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChecklistOperationRow(
      operationId: serializer.fromJson<String>(json['operationId']),
      roomId: serializer.fromJson<String>(json['roomId']),
      ticketId: serializer.fromJson<String?>(json['ticketId']),
      orderIndex: serializer.fromJson<int>(json['orderIndex']),
      name: serializer.fromJson<String>(json['name']),
      description: serializer.fromJson<String?>(json['description']),
      equipmentJson: serializer.fromJson<String?>(json['equipmentJson']),
      estimatedTimeMin: serializer.fromJson<int?>(json['estimatedTimeMin']),
      requiresPhoto: serializer.fromJson<bool>(json['requiresPhoto']),
      requiresQr: serializer.fromJson<bool>(json['requiresQr']),
      startedAtLocal: serializer.fromJson<DateTime?>(json['startedAtLocal']),
      completedAtLocal:
          serializer.fromJson<DateTime?>(json['completedAtLocal']),
      photoLocalPath: serializer.fromJson<String?>(json['photoLocalPath']),
      photoFileId: serializer.fromJson<String?>(json['photoFileId']),
      photoUrl: serializer.fromJson<String?>(json['photoUrl']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'operationId': serializer.toJson<String>(operationId),
      'roomId': serializer.toJson<String>(roomId),
      'ticketId': serializer.toJson<String?>(ticketId),
      'orderIndex': serializer.toJson<int>(orderIndex),
      'name': serializer.toJson<String>(name),
      'description': serializer.toJson<String?>(description),
      'equipmentJson': serializer.toJson<String?>(equipmentJson),
      'estimatedTimeMin': serializer.toJson<int?>(estimatedTimeMin),
      'requiresPhoto': serializer.toJson<bool>(requiresPhoto),
      'requiresQr': serializer.toJson<bool>(requiresQr),
      'startedAtLocal': serializer.toJson<DateTime?>(startedAtLocal),
      'completedAtLocal': serializer.toJson<DateTime?>(completedAtLocal),
      'photoLocalPath': serializer.toJson<String?>(photoLocalPath),
      'photoFileId': serializer.toJson<String?>(photoFileId),
      'photoUrl': serializer.toJson<String?>(photoUrl),
      'syncStatus': serializer.toJson<String>(syncStatus),
    };
  }

  ChecklistOperationRow copyWith(
          {String? operationId,
          String? roomId,
          Value<String?> ticketId = const Value.absent(),
          int? orderIndex,
          String? name,
          Value<String?> description = const Value.absent(),
          Value<String?> equipmentJson = const Value.absent(),
          Value<int?> estimatedTimeMin = const Value.absent(),
          bool? requiresPhoto,
          bool? requiresQr,
          Value<DateTime?> startedAtLocal = const Value.absent(),
          Value<DateTime?> completedAtLocal = const Value.absent(),
          Value<String?> photoLocalPath = const Value.absent(),
          Value<String?> photoFileId = const Value.absent(),
          Value<String?> photoUrl = const Value.absent(),
          String? syncStatus}) =>
      ChecklistOperationRow(
        operationId: operationId ?? this.operationId,
        roomId: roomId ?? this.roomId,
        ticketId: ticketId.present ? ticketId.value : this.ticketId,
        orderIndex: orderIndex ?? this.orderIndex,
        name: name ?? this.name,
        description: description.present ? description.value : this.description,
        equipmentJson:
            equipmentJson.present ? equipmentJson.value : this.equipmentJson,
        estimatedTimeMin: estimatedTimeMin.present
            ? estimatedTimeMin.value
            : this.estimatedTimeMin,
        requiresPhoto: requiresPhoto ?? this.requiresPhoto,
        requiresQr: requiresQr ?? this.requiresQr,
        startedAtLocal:
            startedAtLocal.present ? startedAtLocal.value : this.startedAtLocal,
        completedAtLocal: completedAtLocal.present
            ? completedAtLocal.value
            : this.completedAtLocal,
        photoLocalPath:
            photoLocalPath.present ? photoLocalPath.value : this.photoLocalPath,
        photoFileId: photoFileId.present ? photoFileId.value : this.photoFileId,
        photoUrl: photoUrl.present ? photoUrl.value : this.photoUrl,
        syncStatus: syncStatus ?? this.syncStatus,
      );
  ChecklistOperationRow copyWithCompanion(ChecklistOperationsCompanion data) {
    return ChecklistOperationRow(
      operationId:
          data.operationId.present ? data.operationId.value : this.operationId,
      roomId: data.roomId.present ? data.roomId.value : this.roomId,
      ticketId: data.ticketId.present ? data.ticketId.value : this.ticketId,
      orderIndex:
          data.orderIndex.present ? data.orderIndex.value : this.orderIndex,
      name: data.name.present ? data.name.value : this.name,
      description:
          data.description.present ? data.description.value : this.description,
      equipmentJson: data.equipmentJson.present
          ? data.equipmentJson.value
          : this.equipmentJson,
      estimatedTimeMin: data.estimatedTimeMin.present
          ? data.estimatedTimeMin.value
          : this.estimatedTimeMin,
      requiresPhoto: data.requiresPhoto.present
          ? data.requiresPhoto.value
          : this.requiresPhoto,
      requiresQr:
          data.requiresQr.present ? data.requiresQr.value : this.requiresQr,
      startedAtLocal: data.startedAtLocal.present
          ? data.startedAtLocal.value
          : this.startedAtLocal,
      completedAtLocal: data.completedAtLocal.present
          ? data.completedAtLocal.value
          : this.completedAtLocal,
      photoLocalPath: data.photoLocalPath.present
          ? data.photoLocalPath.value
          : this.photoLocalPath,
      photoFileId:
          data.photoFileId.present ? data.photoFileId.value : this.photoFileId,
      photoUrl: data.photoUrl.present ? data.photoUrl.value : this.photoUrl,
      syncStatus:
          data.syncStatus.present ? data.syncStatus.value : this.syncStatus,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChecklistOperationRow(')
          ..write('operationId: $operationId, ')
          ..write('roomId: $roomId, ')
          ..write('ticketId: $ticketId, ')
          ..write('orderIndex: $orderIndex, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('equipmentJson: $equipmentJson, ')
          ..write('estimatedTimeMin: $estimatedTimeMin, ')
          ..write('requiresPhoto: $requiresPhoto, ')
          ..write('requiresQr: $requiresQr, ')
          ..write('startedAtLocal: $startedAtLocal, ')
          ..write('completedAtLocal: $completedAtLocal, ')
          ..write('photoLocalPath: $photoLocalPath, ')
          ..write('photoFileId: $photoFileId, ')
          ..write('photoUrl: $photoUrl, ')
          ..write('syncStatus: $syncStatus')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      operationId,
      roomId,
      ticketId,
      orderIndex,
      name,
      description,
      equipmentJson,
      estimatedTimeMin,
      requiresPhoto,
      requiresQr,
      startedAtLocal,
      completedAtLocal,
      photoLocalPath,
      photoFileId,
      photoUrl,
      syncStatus);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChecklistOperationRow &&
          other.operationId == this.operationId &&
          other.roomId == this.roomId &&
          other.ticketId == this.ticketId &&
          other.orderIndex == this.orderIndex &&
          other.name == this.name &&
          other.description == this.description &&
          other.equipmentJson == this.equipmentJson &&
          other.estimatedTimeMin == this.estimatedTimeMin &&
          other.requiresPhoto == this.requiresPhoto &&
          other.requiresQr == this.requiresQr &&
          other.startedAtLocal == this.startedAtLocal &&
          other.completedAtLocal == this.completedAtLocal &&
          other.photoLocalPath == this.photoLocalPath &&
          other.photoFileId == this.photoFileId &&
          other.photoUrl == this.photoUrl &&
          other.syncStatus == this.syncStatus);
}

class ChecklistOperationsCompanion
    extends UpdateCompanion<ChecklistOperationRow> {
  final Value<String> operationId;
  final Value<String> roomId;
  final Value<String?> ticketId;
  final Value<int> orderIndex;
  final Value<String> name;
  final Value<String?> description;
  final Value<String?> equipmentJson;
  final Value<int?> estimatedTimeMin;
  final Value<bool> requiresPhoto;
  final Value<bool> requiresQr;
  final Value<DateTime?> startedAtLocal;
  final Value<DateTime?> completedAtLocal;
  final Value<String?> photoLocalPath;
  final Value<String?> photoFileId;
  final Value<String?> photoUrl;
  final Value<String> syncStatus;
  final Value<int> rowid;
  const ChecklistOperationsCompanion({
    this.operationId = const Value.absent(),
    this.roomId = const Value.absent(),
    this.ticketId = const Value.absent(),
    this.orderIndex = const Value.absent(),
    this.name = const Value.absent(),
    this.description = const Value.absent(),
    this.equipmentJson = const Value.absent(),
    this.estimatedTimeMin = const Value.absent(),
    this.requiresPhoto = const Value.absent(),
    this.requiresQr = const Value.absent(),
    this.startedAtLocal = const Value.absent(),
    this.completedAtLocal = const Value.absent(),
    this.photoLocalPath = const Value.absent(),
    this.photoFileId = const Value.absent(),
    this.photoUrl = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ChecklistOperationsCompanion.insert({
    required String operationId,
    required String roomId,
    this.ticketId = const Value.absent(),
    this.orderIndex = const Value.absent(),
    required String name,
    this.description = const Value.absent(),
    this.equipmentJson = const Value.absent(),
    this.estimatedTimeMin = const Value.absent(),
    this.requiresPhoto = const Value.absent(),
    this.requiresQr = const Value.absent(),
    this.startedAtLocal = const Value.absent(),
    this.completedAtLocal = const Value.absent(),
    this.photoLocalPath = const Value.absent(),
    this.photoFileId = const Value.absent(),
    this.photoUrl = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : operationId = Value(operationId),
        roomId = Value(roomId),
        name = Value(name);
  static Insertable<ChecklistOperationRow> custom({
    Expression<String>? operationId,
    Expression<String>? roomId,
    Expression<String>? ticketId,
    Expression<int>? orderIndex,
    Expression<String>? name,
    Expression<String>? description,
    Expression<String>? equipmentJson,
    Expression<int>? estimatedTimeMin,
    Expression<bool>? requiresPhoto,
    Expression<bool>? requiresQr,
    Expression<DateTime>? startedAtLocal,
    Expression<DateTime>? completedAtLocal,
    Expression<String>? photoLocalPath,
    Expression<String>? photoFileId,
    Expression<String>? photoUrl,
    Expression<String>? syncStatus,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (operationId != null) 'operation_id': operationId,
      if (roomId != null) 'room_id': roomId,
      if (ticketId != null) 'ticket_id': ticketId,
      if (orderIndex != null) 'order_index': orderIndex,
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (equipmentJson != null) 'equipment_json': equipmentJson,
      if (estimatedTimeMin != null) 'estimated_time_min': estimatedTimeMin,
      if (requiresPhoto != null) 'requires_photo': requiresPhoto,
      if (requiresQr != null) 'requires_qr': requiresQr,
      if (startedAtLocal != null) 'started_at_local': startedAtLocal,
      if (completedAtLocal != null) 'completed_at_local': completedAtLocal,
      if (photoLocalPath != null) 'photo_local_path': photoLocalPath,
      if (photoFileId != null) 'photo_file_id': photoFileId,
      if (photoUrl != null) 'photo_url': photoUrl,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ChecklistOperationsCompanion copyWith(
      {Value<String>? operationId,
      Value<String>? roomId,
      Value<String?>? ticketId,
      Value<int>? orderIndex,
      Value<String>? name,
      Value<String?>? description,
      Value<String?>? equipmentJson,
      Value<int?>? estimatedTimeMin,
      Value<bool>? requiresPhoto,
      Value<bool>? requiresQr,
      Value<DateTime?>? startedAtLocal,
      Value<DateTime?>? completedAtLocal,
      Value<String?>? photoLocalPath,
      Value<String?>? photoFileId,
      Value<String?>? photoUrl,
      Value<String>? syncStatus,
      Value<int>? rowid}) {
    return ChecklistOperationsCompanion(
      operationId: operationId ?? this.operationId,
      roomId: roomId ?? this.roomId,
      ticketId: ticketId ?? this.ticketId,
      orderIndex: orderIndex ?? this.orderIndex,
      name: name ?? this.name,
      description: description ?? this.description,
      equipmentJson: equipmentJson ?? this.equipmentJson,
      estimatedTimeMin: estimatedTimeMin ?? this.estimatedTimeMin,
      requiresPhoto: requiresPhoto ?? this.requiresPhoto,
      requiresQr: requiresQr ?? this.requiresQr,
      startedAtLocal: startedAtLocal ?? this.startedAtLocal,
      completedAtLocal: completedAtLocal ?? this.completedAtLocal,
      photoLocalPath: photoLocalPath ?? this.photoLocalPath,
      photoFileId: photoFileId ?? this.photoFileId,
      photoUrl: photoUrl ?? this.photoUrl,
      syncStatus: syncStatus ?? this.syncStatus,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (operationId.present) {
      map['operation_id'] = Variable<String>(operationId.value);
    }
    if (roomId.present) {
      map['room_id'] = Variable<String>(roomId.value);
    }
    if (ticketId.present) {
      map['ticket_id'] = Variable<String>(ticketId.value);
    }
    if (orderIndex.present) {
      map['order_index'] = Variable<int>(orderIndex.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (equipmentJson.present) {
      map['equipment_json'] = Variable<String>(equipmentJson.value);
    }
    if (estimatedTimeMin.present) {
      map['estimated_time_min'] = Variable<int>(estimatedTimeMin.value);
    }
    if (requiresPhoto.present) {
      map['requires_photo'] = Variable<bool>(requiresPhoto.value);
    }
    if (requiresQr.present) {
      map['requires_qr'] = Variable<bool>(requiresQr.value);
    }
    if (startedAtLocal.present) {
      map['started_at_local'] = Variable<DateTime>(startedAtLocal.value);
    }
    if (completedAtLocal.present) {
      map['completed_at_local'] = Variable<DateTime>(completedAtLocal.value);
    }
    if (photoLocalPath.present) {
      map['photo_local_path'] = Variable<String>(photoLocalPath.value);
    }
    if (photoFileId.present) {
      map['photo_file_id'] = Variable<String>(photoFileId.value);
    }
    if (photoUrl.present) {
      map['photo_url'] = Variable<String>(photoUrl.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChecklistOperationsCompanion(')
          ..write('operationId: $operationId, ')
          ..write('roomId: $roomId, ')
          ..write('ticketId: $ticketId, ')
          ..write('orderIndex: $orderIndex, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('equipmentJson: $equipmentJson, ')
          ..write('estimatedTimeMin: $estimatedTimeMin, ')
          ..write('requiresPhoto: $requiresPhoto, ')
          ..write('requiresQr: $requiresQr, ')
          ..write('startedAtLocal: $startedAtLocal, ')
          ..write('completedAtLocal: $completedAtLocal, ')
          ..write('photoLocalPath: $photoLocalPath, ')
          ..write('photoFileId: $photoFileId, ')
          ..write('photoUrl: $photoUrl, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedRoomsTable extends CachedRooms
    with TableInfo<$CachedRoomsTable, CachedRoomRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedRoomsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _floorIdMeta =
      const VerificationMeta('floorId');
  @override
  late final GeneratedColumn<String> floorId = GeneratedColumn<String>(
      'floor_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _areaM2Meta = const VerificationMeta('areaM2');
  @override
  late final GeneratedColumn<double> areaM2 = GeneratedColumn<double>(
      'area_m2', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _floorTypeMeta =
      const VerificationMeta('floorType');
  @override
  late final GeneratedColumn<String> floorType = GeneratedColumn<String>(
      'floor_type', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _zoneMeta = const VerificationMeta('zone');
  @override
  late final GeneratedColumn<String> zone = GeneratedColumn<String>(
      'zone', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _techCardIdMeta =
      const VerificationMeta('techCardId');
  @override
  late final GeneratedColumn<String> techCardId = GeneratedColumn<String>(
      'tech_card_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _coordsXMeta =
      const VerificationMeta('coordsX');
  @override
  late final GeneratedColumn<int> coordsX = GeneratedColumn<int>(
      'coords_x', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _coordsYMeta =
      const VerificationMeta('coordsY');
  @override
  late final GeneratedColumn<int> coordsY = GeneratedColumn<int>(
      'coords_y', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _coordsWidthMeta =
      const VerificationMeta('coordsWidth');
  @override
  late final GeneratedColumn<int> coordsWidth = GeneratedColumn<int>(
      'coords_width', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _coordsHeightMeta =
      const VerificationMeta('coordsHeight');
  @override
  late final GeneratedColumn<int> coordsHeight = GeneratedColumn<int>(
      'coords_height', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        floorId,
        name,
        areaM2,
        floorType,
        zone,
        techCardId,
        coordsX,
        coordsY,
        coordsWidth,
        coordsHeight
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_rooms';
  @override
  VerificationContext validateIntegrity(Insertable<CachedRoomRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('floor_id')) {
      context.handle(_floorIdMeta,
          floorId.isAcceptableOrUnknown(data['floor_id']!, _floorIdMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('area_m2')) {
      context.handle(_areaM2Meta,
          areaM2.isAcceptableOrUnknown(data['area_m2']!, _areaM2Meta));
    }
    if (data.containsKey('floor_type')) {
      context.handle(_floorTypeMeta,
          floorType.isAcceptableOrUnknown(data['floor_type']!, _floorTypeMeta));
    }
    if (data.containsKey('zone')) {
      context.handle(
          _zoneMeta, zone.isAcceptableOrUnknown(data['zone']!, _zoneMeta));
    }
    if (data.containsKey('tech_card_id')) {
      context.handle(
          _techCardIdMeta,
          techCardId.isAcceptableOrUnknown(
              data['tech_card_id']!, _techCardIdMeta));
    }
    if (data.containsKey('coords_x')) {
      context.handle(_coordsXMeta,
          coordsX.isAcceptableOrUnknown(data['coords_x']!, _coordsXMeta));
    }
    if (data.containsKey('coords_y')) {
      context.handle(_coordsYMeta,
          coordsY.isAcceptableOrUnknown(data['coords_y']!, _coordsYMeta));
    }
    if (data.containsKey('coords_width')) {
      context.handle(
          _coordsWidthMeta,
          coordsWidth.isAcceptableOrUnknown(
              data['coords_width']!, _coordsWidthMeta));
    }
    if (data.containsKey('coords_height')) {
      context.handle(
          _coordsHeightMeta,
          coordsHeight.isAcceptableOrUnknown(
              data['coords_height']!, _coordsHeightMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedRoomRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedRoomRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      floorId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}floor_id']),
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      areaM2: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}area_m2']),
      floorType: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}floor_type']),
      zone: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}zone']),
      techCardId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tech_card_id']),
      coordsX: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}coords_x']),
      coordsY: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}coords_y']),
      coordsWidth: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}coords_width']),
      coordsHeight: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}coords_height']),
    );
  }

  @override
  $CachedRoomsTable createAlias(String alias) {
    return $CachedRoomsTable(attachedDatabase, alias);
  }
}

class CachedRoomRow extends DataClass implements Insertable<CachedRoomRow> {
  final String id;
  final String? floorId;
  final String name;
  final double? areaM2;
  final String? floorType;
  final String? zone;
  final String? techCardId;
  final int? coordsX;
  final int? coordsY;
  final int? coordsWidth;
  final int? coordsHeight;
  const CachedRoomRow(
      {required this.id,
      this.floorId,
      required this.name,
      this.areaM2,
      this.floorType,
      this.zone,
      this.techCardId,
      this.coordsX,
      this.coordsY,
      this.coordsWidth,
      this.coordsHeight});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || floorId != null) {
      map['floor_id'] = Variable<String>(floorId);
    }
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || areaM2 != null) {
      map['area_m2'] = Variable<double>(areaM2);
    }
    if (!nullToAbsent || floorType != null) {
      map['floor_type'] = Variable<String>(floorType);
    }
    if (!nullToAbsent || zone != null) {
      map['zone'] = Variable<String>(zone);
    }
    if (!nullToAbsent || techCardId != null) {
      map['tech_card_id'] = Variable<String>(techCardId);
    }
    if (!nullToAbsent || coordsX != null) {
      map['coords_x'] = Variable<int>(coordsX);
    }
    if (!nullToAbsent || coordsY != null) {
      map['coords_y'] = Variable<int>(coordsY);
    }
    if (!nullToAbsent || coordsWidth != null) {
      map['coords_width'] = Variable<int>(coordsWidth);
    }
    if (!nullToAbsent || coordsHeight != null) {
      map['coords_height'] = Variable<int>(coordsHeight);
    }
    return map;
  }

  CachedRoomsCompanion toCompanion(bool nullToAbsent) {
    return CachedRoomsCompanion(
      id: Value(id),
      floorId: floorId == null && nullToAbsent
          ? const Value.absent()
          : Value(floorId),
      name: Value(name),
      areaM2:
          areaM2 == null && nullToAbsent ? const Value.absent() : Value(areaM2),
      floorType: floorType == null && nullToAbsent
          ? const Value.absent()
          : Value(floorType),
      zone: zone == null && nullToAbsent ? const Value.absent() : Value(zone),
      techCardId: techCardId == null && nullToAbsent
          ? const Value.absent()
          : Value(techCardId),
      coordsX: coordsX == null && nullToAbsent
          ? const Value.absent()
          : Value(coordsX),
      coordsY: coordsY == null && nullToAbsent
          ? const Value.absent()
          : Value(coordsY),
      coordsWidth: coordsWidth == null && nullToAbsent
          ? const Value.absent()
          : Value(coordsWidth),
      coordsHeight: coordsHeight == null && nullToAbsent
          ? const Value.absent()
          : Value(coordsHeight),
    );
  }

  factory CachedRoomRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedRoomRow(
      id: serializer.fromJson<String>(json['id']),
      floorId: serializer.fromJson<String?>(json['floorId']),
      name: serializer.fromJson<String>(json['name']),
      areaM2: serializer.fromJson<double?>(json['areaM2']),
      floorType: serializer.fromJson<String?>(json['floorType']),
      zone: serializer.fromJson<String?>(json['zone']),
      techCardId: serializer.fromJson<String?>(json['techCardId']),
      coordsX: serializer.fromJson<int?>(json['coordsX']),
      coordsY: serializer.fromJson<int?>(json['coordsY']),
      coordsWidth: serializer.fromJson<int?>(json['coordsWidth']),
      coordsHeight: serializer.fromJson<int?>(json['coordsHeight']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'floorId': serializer.toJson<String?>(floorId),
      'name': serializer.toJson<String>(name),
      'areaM2': serializer.toJson<double?>(areaM2),
      'floorType': serializer.toJson<String?>(floorType),
      'zone': serializer.toJson<String?>(zone),
      'techCardId': serializer.toJson<String?>(techCardId),
      'coordsX': serializer.toJson<int?>(coordsX),
      'coordsY': serializer.toJson<int?>(coordsY),
      'coordsWidth': serializer.toJson<int?>(coordsWidth),
      'coordsHeight': serializer.toJson<int?>(coordsHeight),
    };
  }

  CachedRoomRow copyWith(
          {String? id,
          Value<String?> floorId = const Value.absent(),
          String? name,
          Value<double?> areaM2 = const Value.absent(),
          Value<String?> floorType = const Value.absent(),
          Value<String?> zone = const Value.absent(),
          Value<String?> techCardId = const Value.absent(),
          Value<int?> coordsX = const Value.absent(),
          Value<int?> coordsY = const Value.absent(),
          Value<int?> coordsWidth = const Value.absent(),
          Value<int?> coordsHeight = const Value.absent()}) =>
      CachedRoomRow(
        id: id ?? this.id,
        floorId: floorId.present ? floorId.value : this.floorId,
        name: name ?? this.name,
        areaM2: areaM2.present ? areaM2.value : this.areaM2,
        floorType: floorType.present ? floorType.value : this.floorType,
        zone: zone.present ? zone.value : this.zone,
        techCardId: techCardId.present ? techCardId.value : this.techCardId,
        coordsX: coordsX.present ? coordsX.value : this.coordsX,
        coordsY: coordsY.present ? coordsY.value : this.coordsY,
        coordsWidth: coordsWidth.present ? coordsWidth.value : this.coordsWidth,
        coordsHeight:
            coordsHeight.present ? coordsHeight.value : this.coordsHeight,
      );
  CachedRoomRow copyWithCompanion(CachedRoomsCompanion data) {
    return CachedRoomRow(
      id: data.id.present ? data.id.value : this.id,
      floorId: data.floorId.present ? data.floorId.value : this.floorId,
      name: data.name.present ? data.name.value : this.name,
      areaM2: data.areaM2.present ? data.areaM2.value : this.areaM2,
      floorType: data.floorType.present ? data.floorType.value : this.floorType,
      zone: data.zone.present ? data.zone.value : this.zone,
      techCardId:
          data.techCardId.present ? data.techCardId.value : this.techCardId,
      coordsX: data.coordsX.present ? data.coordsX.value : this.coordsX,
      coordsY: data.coordsY.present ? data.coordsY.value : this.coordsY,
      coordsWidth:
          data.coordsWidth.present ? data.coordsWidth.value : this.coordsWidth,
      coordsHeight: data.coordsHeight.present
          ? data.coordsHeight.value
          : this.coordsHeight,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedRoomRow(')
          ..write('id: $id, ')
          ..write('floorId: $floorId, ')
          ..write('name: $name, ')
          ..write('areaM2: $areaM2, ')
          ..write('floorType: $floorType, ')
          ..write('zone: $zone, ')
          ..write('techCardId: $techCardId, ')
          ..write('coordsX: $coordsX, ')
          ..write('coordsY: $coordsY, ')
          ..write('coordsWidth: $coordsWidth, ')
          ..write('coordsHeight: $coordsHeight')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, floorId, name, areaM2, floorType, zone,
      techCardId, coordsX, coordsY, coordsWidth, coordsHeight);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedRoomRow &&
          other.id == this.id &&
          other.floorId == this.floorId &&
          other.name == this.name &&
          other.areaM2 == this.areaM2 &&
          other.floorType == this.floorType &&
          other.zone == this.zone &&
          other.techCardId == this.techCardId &&
          other.coordsX == this.coordsX &&
          other.coordsY == this.coordsY &&
          other.coordsWidth == this.coordsWidth &&
          other.coordsHeight == this.coordsHeight);
}

class CachedRoomsCompanion extends UpdateCompanion<CachedRoomRow> {
  final Value<String> id;
  final Value<String?> floorId;
  final Value<String> name;
  final Value<double?> areaM2;
  final Value<String?> floorType;
  final Value<String?> zone;
  final Value<String?> techCardId;
  final Value<int?> coordsX;
  final Value<int?> coordsY;
  final Value<int?> coordsWidth;
  final Value<int?> coordsHeight;
  final Value<int> rowid;
  const CachedRoomsCompanion({
    this.id = const Value.absent(),
    this.floorId = const Value.absent(),
    this.name = const Value.absent(),
    this.areaM2 = const Value.absent(),
    this.floorType = const Value.absent(),
    this.zone = const Value.absent(),
    this.techCardId = const Value.absent(),
    this.coordsX = const Value.absent(),
    this.coordsY = const Value.absent(),
    this.coordsWidth = const Value.absent(),
    this.coordsHeight = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedRoomsCompanion.insert({
    required String id,
    this.floorId = const Value.absent(),
    required String name,
    this.areaM2 = const Value.absent(),
    this.floorType = const Value.absent(),
    this.zone = const Value.absent(),
    this.techCardId = const Value.absent(),
    this.coordsX = const Value.absent(),
    this.coordsY = const Value.absent(),
    this.coordsWidth = const Value.absent(),
    this.coordsHeight = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        name = Value(name);
  static Insertable<CachedRoomRow> custom({
    Expression<String>? id,
    Expression<String>? floorId,
    Expression<String>? name,
    Expression<double>? areaM2,
    Expression<String>? floorType,
    Expression<String>? zone,
    Expression<String>? techCardId,
    Expression<int>? coordsX,
    Expression<int>? coordsY,
    Expression<int>? coordsWidth,
    Expression<int>? coordsHeight,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (floorId != null) 'floor_id': floorId,
      if (name != null) 'name': name,
      if (areaM2 != null) 'area_m2': areaM2,
      if (floorType != null) 'floor_type': floorType,
      if (zone != null) 'zone': zone,
      if (techCardId != null) 'tech_card_id': techCardId,
      if (coordsX != null) 'coords_x': coordsX,
      if (coordsY != null) 'coords_y': coordsY,
      if (coordsWidth != null) 'coords_width': coordsWidth,
      if (coordsHeight != null) 'coords_height': coordsHeight,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedRoomsCompanion copyWith(
      {Value<String>? id,
      Value<String?>? floorId,
      Value<String>? name,
      Value<double?>? areaM2,
      Value<String?>? floorType,
      Value<String?>? zone,
      Value<String?>? techCardId,
      Value<int?>? coordsX,
      Value<int?>? coordsY,
      Value<int?>? coordsWidth,
      Value<int?>? coordsHeight,
      Value<int>? rowid}) {
    return CachedRoomsCompanion(
      id: id ?? this.id,
      floorId: floorId ?? this.floorId,
      name: name ?? this.name,
      areaM2: areaM2 ?? this.areaM2,
      floorType: floorType ?? this.floorType,
      zone: zone ?? this.zone,
      techCardId: techCardId ?? this.techCardId,
      coordsX: coordsX ?? this.coordsX,
      coordsY: coordsY ?? this.coordsY,
      coordsWidth: coordsWidth ?? this.coordsWidth,
      coordsHeight: coordsHeight ?? this.coordsHeight,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (floorId.present) {
      map['floor_id'] = Variable<String>(floorId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (areaM2.present) {
      map['area_m2'] = Variable<double>(areaM2.value);
    }
    if (floorType.present) {
      map['floor_type'] = Variable<String>(floorType.value);
    }
    if (zone.present) {
      map['zone'] = Variable<String>(zone.value);
    }
    if (techCardId.present) {
      map['tech_card_id'] = Variable<String>(techCardId.value);
    }
    if (coordsX.present) {
      map['coords_x'] = Variable<int>(coordsX.value);
    }
    if (coordsY.present) {
      map['coords_y'] = Variable<int>(coordsY.value);
    }
    if (coordsWidth.present) {
      map['coords_width'] = Variable<int>(coordsWidth.value);
    }
    if (coordsHeight.present) {
      map['coords_height'] = Variable<int>(coordsHeight.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedRoomsCompanion(')
          ..write('id: $id, ')
          ..write('floorId: $floorId, ')
          ..write('name: $name, ')
          ..write('areaM2: $areaM2, ')
          ..write('floorType: $floorType, ')
          ..write('zone: $zone, ')
          ..write('techCardId: $techCardId, ')
          ..write('coordsX: $coordsX, ')
          ..write('coordsY: $coordsY, ')
          ..write('coordsWidth: $coordsWidth, ')
          ..write('coordsHeight: $coordsHeight, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedTechCardsTable extends CachedTechCards
    with TableInfo<$CachedTechCardsTable, CachedTechCardRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedTechCardsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _operationsJsonMeta =
      const VerificationMeta('operationsJson');
  @override
  late final GeneratedColumn<String> operationsJson = GeneratedColumn<String>(
      'operations_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _totalEstimatedTimeMinMeta =
      const VerificationMeta('totalEstimatedTimeMin');
  @override
  late final GeneratedColumn<int> totalEstimatedTimeMin = GeneratedColumn<int>(
      'total_estimated_time_min', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, name, operationsJson, totalEstimatedTimeMin, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_tech_cards';
  @override
  VerificationContext validateIntegrity(Insertable<CachedTechCardRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('operations_json')) {
      context.handle(
          _operationsJsonMeta,
          operationsJson.isAcceptableOrUnknown(
              data['operations_json']!, _operationsJsonMeta));
    } else if (isInserting) {
      context.missing(_operationsJsonMeta);
    }
    if (data.containsKey('total_estimated_time_min')) {
      context.handle(
          _totalEstimatedTimeMinMeta,
          totalEstimatedTimeMin.isAcceptableOrUnknown(
              data['total_estimated_time_min']!, _totalEstimatedTimeMinMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedTechCardRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedTechCardRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      operationsJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}operations_json'])!,
      totalEstimatedTimeMin: attachedDatabase.typeMapping.read(DriftSqlType.int,
          data['${effectivePrefix}total_estimated_time_min'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $CachedTechCardsTable createAlias(String alias) {
    return $CachedTechCardsTable(attachedDatabase, alias);
  }
}

class CachedTechCardRow extends DataClass
    implements Insertable<CachedTechCardRow> {
  final String id;
  final String name;
  final String operationsJson;
  final int totalEstimatedTimeMin;
  final DateTime updatedAt;
  const CachedTechCardRow(
      {required this.id,
      required this.name,
      required this.operationsJson,
      required this.totalEstimatedTimeMin,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['operations_json'] = Variable<String>(operationsJson);
    map['total_estimated_time_min'] = Variable<int>(totalEstimatedTimeMin);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  CachedTechCardsCompanion toCompanion(bool nullToAbsent) {
    return CachedTechCardsCompanion(
      id: Value(id),
      name: Value(name),
      operationsJson: Value(operationsJson),
      totalEstimatedTimeMin: Value(totalEstimatedTimeMin),
      updatedAt: Value(updatedAt),
    );
  }

  factory CachedTechCardRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedTechCardRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      operationsJson: serializer.fromJson<String>(json['operationsJson']),
      totalEstimatedTimeMin:
          serializer.fromJson<int>(json['totalEstimatedTimeMin']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'operationsJson': serializer.toJson<String>(operationsJson),
      'totalEstimatedTimeMin': serializer.toJson<int>(totalEstimatedTimeMin),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  CachedTechCardRow copyWith(
          {String? id,
          String? name,
          String? operationsJson,
          int? totalEstimatedTimeMin,
          DateTime? updatedAt}) =>
      CachedTechCardRow(
        id: id ?? this.id,
        name: name ?? this.name,
        operationsJson: operationsJson ?? this.operationsJson,
        totalEstimatedTimeMin:
            totalEstimatedTimeMin ?? this.totalEstimatedTimeMin,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  CachedTechCardRow copyWithCompanion(CachedTechCardsCompanion data) {
    return CachedTechCardRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      operationsJson: data.operationsJson.present
          ? data.operationsJson.value
          : this.operationsJson,
      totalEstimatedTimeMin: data.totalEstimatedTimeMin.present
          ? data.totalEstimatedTimeMin.value
          : this.totalEstimatedTimeMin,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedTechCardRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('operationsJson: $operationsJson, ')
          ..write('totalEstimatedTimeMin: $totalEstimatedTimeMin, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, operationsJson, totalEstimatedTimeMin, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedTechCardRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.operationsJson == this.operationsJson &&
          other.totalEstimatedTimeMin == this.totalEstimatedTimeMin &&
          other.updatedAt == this.updatedAt);
}

class CachedTechCardsCompanion extends UpdateCompanion<CachedTechCardRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> operationsJson;
  final Value<int> totalEstimatedTimeMin;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const CachedTechCardsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.operationsJson = const Value.absent(),
    this.totalEstimatedTimeMin = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedTechCardsCompanion.insert({
    required String id,
    required String name,
    required String operationsJson,
    this.totalEstimatedTimeMin = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        name = Value(name),
        operationsJson = Value(operationsJson),
        updatedAt = Value(updatedAt);
  static Insertable<CachedTechCardRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? operationsJson,
    Expression<int>? totalEstimatedTimeMin,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (operationsJson != null) 'operations_json': operationsJson,
      if (totalEstimatedTimeMin != null)
        'total_estimated_time_min': totalEstimatedTimeMin,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedTechCardsCompanion copyWith(
      {Value<String>? id,
      Value<String>? name,
      Value<String>? operationsJson,
      Value<int>? totalEstimatedTimeMin,
      Value<DateTime>? updatedAt,
      Value<int>? rowid}) {
    return CachedTechCardsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      operationsJson: operationsJson ?? this.operationsJson,
      totalEstimatedTimeMin:
          totalEstimatedTimeMin ?? this.totalEstimatedTimeMin,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (operationsJson.present) {
      map['operations_json'] = Variable<String>(operationsJson.value);
    }
    if (totalEstimatedTimeMin.present) {
      map['total_estimated_time_min'] =
          Variable<int>(totalEstimatedTimeMin.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedTechCardsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('operationsJson: $operationsJson, ')
          ..write('totalEstimatedTimeMin: $totalEstimatedTimeMin, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedTicketsTable extends CachedTickets
    with TableInfo<$CachedTicketsTable, CachedTicketRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedTicketsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _priorityMeta =
      const VerificationMeta('priority');
  @override
  late final GeneratedColumn<String> priority = GeneratedColumn<String>(
      'priority', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _descriptionMeta =
      const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
      'description', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _roomIdMeta = const VerificationMeta('roomId');
  @override
  late final GeneratedColumn<String> roomId = GeneratedColumn<String>(
      'room_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _completionDeadlineMeta =
      const VerificationMeta('completionDeadline');
  @override
  late final GeneratedColumn<String> completionDeadline =
      GeneratedColumn<String>('completion_deadline', aliasedName, true,
          type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _operationsCompletedMeta =
      const VerificationMeta('operationsCompleted');
  @override
  late final GeneratedColumn<int> operationsCompleted = GeneratedColumn<int>(
      'operations_completed', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        type,
        priority,
        status,
        description,
        roomId,
        completionDeadline,
        operationsCompleted,
        updatedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_tickets';
  @override
  VerificationContext validateIntegrity(Insertable<CachedTicketRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('priority')) {
      context.handle(_priorityMeta,
          priority.isAcceptableOrUnknown(data['priority']!, _priorityMeta));
    } else if (isInserting) {
      context.missing(_priorityMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('description')) {
      context.handle(
          _descriptionMeta,
          description.isAcceptableOrUnknown(
              data['description']!, _descriptionMeta));
    }
    if (data.containsKey('room_id')) {
      context.handle(_roomIdMeta,
          roomId.isAcceptableOrUnknown(data['room_id']!, _roomIdMeta));
    }
    if (data.containsKey('completion_deadline')) {
      context.handle(
          _completionDeadlineMeta,
          completionDeadline.isAcceptableOrUnknown(
              data['completion_deadline']!, _completionDeadlineMeta));
    }
    if (data.containsKey('operations_completed')) {
      context.handle(
          _operationsCompletedMeta,
          operationsCompleted.isAcceptableOrUnknown(
              data['operations_completed']!, _operationsCompletedMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedTicketRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedTicketRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      priority: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}priority'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      description: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}description']),
      roomId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}room_id']),
      completionDeadline: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}completion_deadline']),
      operationsCompleted: attachedDatabase.typeMapping.read(
          DriftSqlType.int, data['${effectivePrefix}operations_completed']),
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $CachedTicketsTable createAlias(String alias) {
    return $CachedTicketsTable(attachedDatabase, alias);
  }
}

class CachedTicketRow extends DataClass implements Insertable<CachedTicketRow> {
  final String id;
  final String type;
  final String priority;
  final String status;
  final String? description;
  final String? roomId;
  final String? completionDeadline;
  final int? operationsCompleted;
  final DateTime updatedAt;
  const CachedTicketRow(
      {required this.id,
      required this.type,
      required this.priority,
      required this.status,
      this.description,
      this.roomId,
      this.completionDeadline,
      this.operationsCompleted,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['type'] = Variable<String>(type);
    map['priority'] = Variable<String>(priority);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || description != null) {
      map['description'] = Variable<String>(description);
    }
    if (!nullToAbsent || roomId != null) {
      map['room_id'] = Variable<String>(roomId);
    }
    if (!nullToAbsent || completionDeadline != null) {
      map['completion_deadline'] = Variable<String>(completionDeadline);
    }
    if (!nullToAbsent || operationsCompleted != null) {
      map['operations_completed'] = Variable<int>(operationsCompleted);
    }
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  CachedTicketsCompanion toCompanion(bool nullToAbsent) {
    return CachedTicketsCompanion(
      id: Value(id),
      type: Value(type),
      priority: Value(priority),
      status: Value(status),
      description: description == null && nullToAbsent
          ? const Value.absent()
          : Value(description),
      roomId:
          roomId == null && nullToAbsent ? const Value.absent() : Value(roomId),
      completionDeadline: completionDeadline == null && nullToAbsent
          ? const Value.absent()
          : Value(completionDeadline),
      operationsCompleted: operationsCompleted == null && nullToAbsent
          ? const Value.absent()
          : Value(operationsCompleted),
      updatedAt: Value(updatedAt),
    );
  }

  factory CachedTicketRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedTicketRow(
      id: serializer.fromJson<String>(json['id']),
      type: serializer.fromJson<String>(json['type']),
      priority: serializer.fromJson<String>(json['priority']),
      status: serializer.fromJson<String>(json['status']),
      description: serializer.fromJson<String?>(json['description']),
      roomId: serializer.fromJson<String?>(json['roomId']),
      completionDeadline:
          serializer.fromJson<String?>(json['completionDeadline']),
      operationsCompleted:
          serializer.fromJson<int?>(json['operationsCompleted']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'type': serializer.toJson<String>(type),
      'priority': serializer.toJson<String>(priority),
      'status': serializer.toJson<String>(status),
      'description': serializer.toJson<String?>(description),
      'roomId': serializer.toJson<String?>(roomId),
      'completionDeadline': serializer.toJson<String?>(completionDeadline),
      'operationsCompleted': serializer.toJson<int?>(operationsCompleted),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  CachedTicketRow copyWith(
          {String? id,
          String? type,
          String? priority,
          String? status,
          Value<String?> description = const Value.absent(),
          Value<String?> roomId = const Value.absent(),
          Value<String?> completionDeadline = const Value.absent(),
          Value<int?> operationsCompleted = const Value.absent(),
          DateTime? updatedAt}) =>
      CachedTicketRow(
        id: id ?? this.id,
        type: type ?? this.type,
        priority: priority ?? this.priority,
        status: status ?? this.status,
        description: description.present ? description.value : this.description,
        roomId: roomId.present ? roomId.value : this.roomId,
        completionDeadline: completionDeadline.present
            ? completionDeadline.value
            : this.completionDeadline,
        operationsCompleted: operationsCompleted.present
            ? operationsCompleted.value
            : this.operationsCompleted,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  CachedTicketRow copyWithCompanion(CachedTicketsCompanion data) {
    return CachedTicketRow(
      id: data.id.present ? data.id.value : this.id,
      type: data.type.present ? data.type.value : this.type,
      priority: data.priority.present ? data.priority.value : this.priority,
      status: data.status.present ? data.status.value : this.status,
      description:
          data.description.present ? data.description.value : this.description,
      roomId: data.roomId.present ? data.roomId.value : this.roomId,
      completionDeadline: data.completionDeadline.present
          ? data.completionDeadline.value
          : this.completionDeadline,
      operationsCompleted: data.operationsCompleted.present
          ? data.operationsCompleted.value
          : this.operationsCompleted,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedTicketRow(')
          ..write('id: $id, ')
          ..write('type: $type, ')
          ..write('priority: $priority, ')
          ..write('status: $status, ')
          ..write('description: $description, ')
          ..write('roomId: $roomId, ')
          ..write('completionDeadline: $completionDeadline, ')
          ..write('operationsCompleted: $operationsCompleted, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, type, priority, status, description,
      roomId, completionDeadline, operationsCompleted, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedTicketRow &&
          other.id == this.id &&
          other.type == this.type &&
          other.priority == this.priority &&
          other.status == this.status &&
          other.description == this.description &&
          other.roomId == this.roomId &&
          other.completionDeadline == this.completionDeadline &&
          other.operationsCompleted == this.operationsCompleted &&
          other.updatedAt == this.updatedAt);
}

class CachedTicketsCompanion extends UpdateCompanion<CachedTicketRow> {
  final Value<String> id;
  final Value<String> type;
  final Value<String> priority;
  final Value<String> status;
  final Value<String?> description;
  final Value<String?> roomId;
  final Value<String?> completionDeadline;
  final Value<int?> operationsCompleted;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const CachedTicketsCompanion({
    this.id = const Value.absent(),
    this.type = const Value.absent(),
    this.priority = const Value.absent(),
    this.status = const Value.absent(),
    this.description = const Value.absent(),
    this.roomId = const Value.absent(),
    this.completionDeadline = const Value.absent(),
    this.operationsCompleted = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedTicketsCompanion.insert({
    required String id,
    required String type,
    required String priority,
    required String status,
    this.description = const Value.absent(),
    this.roomId = const Value.absent(),
    this.completionDeadline = const Value.absent(),
    this.operationsCompleted = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        type = Value(type),
        priority = Value(priority),
        status = Value(status),
        updatedAt = Value(updatedAt);
  static Insertable<CachedTicketRow> custom({
    Expression<String>? id,
    Expression<String>? type,
    Expression<String>? priority,
    Expression<String>? status,
    Expression<String>? description,
    Expression<String>? roomId,
    Expression<String>? completionDeadline,
    Expression<int>? operationsCompleted,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (type != null) 'type': type,
      if (priority != null) 'priority': priority,
      if (status != null) 'status': status,
      if (description != null) 'description': description,
      if (roomId != null) 'room_id': roomId,
      if (completionDeadline != null) 'completion_deadline': completionDeadline,
      if (operationsCompleted != null)
        'operations_completed': operationsCompleted,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedTicketsCompanion copyWith(
      {Value<String>? id,
      Value<String>? type,
      Value<String>? priority,
      Value<String>? status,
      Value<String?>? description,
      Value<String?>? roomId,
      Value<String?>? completionDeadline,
      Value<int?>? operationsCompleted,
      Value<DateTime>? updatedAt,
      Value<int>? rowid}) {
    return CachedTicketsCompanion(
      id: id ?? this.id,
      type: type ?? this.type,
      priority: priority ?? this.priority,
      status: status ?? this.status,
      description: description ?? this.description,
      roomId: roomId ?? this.roomId,
      completionDeadline: completionDeadline ?? this.completionDeadline,
      operationsCompleted: operationsCompleted ?? this.operationsCompleted,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (priority.present) {
      map['priority'] = Variable<String>(priority.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (roomId.present) {
      map['room_id'] = Variable<String>(roomId.value);
    }
    if (completionDeadline.present) {
      map['completion_deadline'] = Variable<String>(completionDeadline.value);
    }
    if (operationsCompleted.present) {
      map['operations_completed'] = Variable<int>(operationsCompleted.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedTicketsCompanion(')
          ..write('id: $id, ')
          ..write('type: $type, ')
          ..write('priority: $priority, ')
          ..write('status: $status, ')
          ..write('description: $description, ')
          ..write('roomId: $roomId, ')
          ..write('completionDeadline: $completionDeadline, ')
          ..write('operationsCompleted: $operationsCompleted, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChatMessagesTable extends ChatMessages
    with TableInfo<$ChatMessagesTable, ChatMessageRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChatMessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _clientIdMeta =
      const VerificationMeta('clientId');
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _serverIdMeta =
      const VerificationMeta('serverId');
  @override
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
      'server_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _chatIdMeta = const VerificationMeta('chatId');
  @override
  late final GeneratedColumn<String> chatId = GeneratedColumn<String>(
      'chat_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _authorIdMeta =
      const VerificationMeta('authorId');
  @override
  late final GeneratedColumn<String> authorId = GeneratedColumn<String>(
      'author_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _messageTextMeta =
      const VerificationMeta('messageText');
  @override
  late final GeneratedColumn<String> messageText = GeneratedColumn<String>(
      'text', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _attachmentIdsJsonMeta =
      const VerificationMeta('attachmentIdsJson');
  @override
  late final GeneratedColumn<String> attachmentIdsJson =
      GeneratedColumn<String>('attachment_ids_json', aliasedName, true,
          type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _createdAtLocalMeta =
      const VerificationMeta('createdAtLocal');
  @override
  late final GeneratedColumn<DateTime> createdAtLocal =
      GeneratedColumn<DateTime>('created_at_local', aliasedName, false,
          type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('pending'));
  @override
  List<GeneratedColumn> get $columns => [
        clientId,
        serverId,
        chatId,
        authorId,
        messageText,
        attachmentIdsJson,
        createdAtLocal,
        status
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'chat_messages';
  @override
  VerificationContext validateIntegrity(Insertable<ChatMessageRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_id')) {
      context.handle(_clientIdMeta,
          clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));
    } else if (isInserting) {
      context.missing(_clientIdMeta);
    }
    if (data.containsKey('server_id')) {
      context.handle(_serverIdMeta,
          serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta));
    }
    if (data.containsKey('chat_id')) {
      context.handle(_chatIdMeta,
          chatId.isAcceptableOrUnknown(data['chat_id']!, _chatIdMeta));
    } else if (isInserting) {
      context.missing(_chatIdMeta);
    }
    if (data.containsKey('author_id')) {
      context.handle(_authorIdMeta,
          authorId.isAcceptableOrUnknown(data['author_id']!, _authorIdMeta));
    }
    if (data.containsKey('text')) {
      context.handle(_messageTextMeta,
          messageText.isAcceptableOrUnknown(data['text']!, _messageTextMeta));
    } else if (isInserting) {
      context.missing(_messageTextMeta);
    }
    if (data.containsKey('attachment_ids_json')) {
      context.handle(
          _attachmentIdsJsonMeta,
          attachmentIdsJson.isAcceptableOrUnknown(
              data['attachment_ids_json']!, _attachmentIdsJsonMeta));
    }
    if (data.containsKey('created_at_local')) {
      context.handle(
          _createdAtLocalMeta,
          createdAtLocal.isAcceptableOrUnknown(
              data['created_at_local']!, _createdAtLocalMeta));
    } else if (isInserting) {
      context.missing(_createdAtLocalMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {clientId};
  @override
  ChatMessageRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChatMessageRow(
      clientId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}client_id'])!,
      serverId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}server_id']),
      chatId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}chat_id'])!,
      authorId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}author_id']),
      messageText: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}text'])!,
      attachmentIdsJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}attachment_ids_json']),
      createdAtLocal: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}created_at_local'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
    );
  }

  @override
  $ChatMessagesTable createAlias(String alias) {
    return $ChatMessagesTable(attachedDatabase, alias);
  }
}

class ChatMessageRow extends DataClass implements Insertable<ChatMessageRow> {
  /// Локальный идентификатор клиента (он же `clientMessageId` для дедупликации).
  final String clientId;

  /// `MessageView.id` сервера; `null`, пока сообщение не подтверждено.
  final String? serverId;
  final String chatId;

  /// Автор сообщения: по нему свои пузыри отличаются от входящих.
  final String? authorId;

  /// Текст сообщения. Геттер назван `messageText`, а колонка — `text`
  /// (`.named('text')`): имя `text` конфликтует с билдером `text()` самого drift.
  final String messageText;

  /// `attachmentIds` в JSON: список id файлов file-service.
  final String? attachmentIdsJson;
  final DateTime createdAtLocal;

  /// `pending` | `sent` | `read` | `failed` (DS-002 `offline.md` §3).
  final String status;
  const ChatMessageRow(
      {required this.clientId,
      this.serverId,
      required this.chatId,
      this.authorId,
      required this.messageText,
      this.attachmentIdsJson,
      required this.createdAtLocal,
      required this.status});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['client_id'] = Variable<String>(clientId);
    if (!nullToAbsent || serverId != null) {
      map['server_id'] = Variable<String>(serverId);
    }
    map['chat_id'] = Variable<String>(chatId);
    if (!nullToAbsent || authorId != null) {
      map['author_id'] = Variable<String>(authorId);
    }
    map['text'] = Variable<String>(messageText);
    if (!nullToAbsent || attachmentIdsJson != null) {
      map['attachment_ids_json'] = Variable<String>(attachmentIdsJson);
    }
    map['created_at_local'] = Variable<DateTime>(createdAtLocal);
    map['status'] = Variable<String>(status);
    return map;
  }

  ChatMessagesCompanion toCompanion(bool nullToAbsent) {
    return ChatMessagesCompanion(
      clientId: Value(clientId),
      serverId: serverId == null && nullToAbsent
          ? const Value.absent()
          : Value(serverId),
      chatId: Value(chatId),
      authorId: authorId == null && nullToAbsent
          ? const Value.absent()
          : Value(authorId),
      messageText: Value(messageText),
      attachmentIdsJson: attachmentIdsJson == null && nullToAbsent
          ? const Value.absent()
          : Value(attachmentIdsJson),
      createdAtLocal: Value(createdAtLocal),
      status: Value(status),
    );
  }

  factory ChatMessageRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChatMessageRow(
      clientId: serializer.fromJson<String>(json['clientId']),
      serverId: serializer.fromJson<String?>(json['serverId']),
      chatId: serializer.fromJson<String>(json['chatId']),
      authorId: serializer.fromJson<String?>(json['authorId']),
      messageText: serializer.fromJson<String>(json['messageText']),
      attachmentIdsJson:
          serializer.fromJson<String?>(json['attachmentIdsJson']),
      createdAtLocal: serializer.fromJson<DateTime>(json['createdAtLocal']),
      status: serializer.fromJson<String>(json['status']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'clientId': serializer.toJson<String>(clientId),
      'serverId': serializer.toJson<String?>(serverId),
      'chatId': serializer.toJson<String>(chatId),
      'authorId': serializer.toJson<String?>(authorId),
      'messageText': serializer.toJson<String>(messageText),
      'attachmentIdsJson': serializer.toJson<String?>(attachmentIdsJson),
      'createdAtLocal': serializer.toJson<DateTime>(createdAtLocal),
      'status': serializer.toJson<String>(status),
    };
  }

  ChatMessageRow copyWith(
          {String? clientId,
          Value<String?> serverId = const Value.absent(),
          String? chatId,
          Value<String?> authorId = const Value.absent(),
          String? messageText,
          Value<String?> attachmentIdsJson = const Value.absent(),
          DateTime? createdAtLocal,
          String? status}) =>
      ChatMessageRow(
        clientId: clientId ?? this.clientId,
        serverId: serverId.present ? serverId.value : this.serverId,
        chatId: chatId ?? this.chatId,
        authorId: authorId.present ? authorId.value : this.authorId,
        messageText: messageText ?? this.messageText,
        attachmentIdsJson: attachmentIdsJson.present
            ? attachmentIdsJson.value
            : this.attachmentIdsJson,
        createdAtLocal: createdAtLocal ?? this.createdAtLocal,
        status: status ?? this.status,
      );
  ChatMessageRow copyWithCompanion(ChatMessagesCompanion data) {
    return ChatMessageRow(
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      chatId: data.chatId.present ? data.chatId.value : this.chatId,
      authorId: data.authorId.present ? data.authorId.value : this.authorId,
      messageText:
          data.messageText.present ? data.messageText.value : this.messageText,
      attachmentIdsJson: data.attachmentIdsJson.present
          ? data.attachmentIdsJson.value
          : this.attachmentIdsJson,
      createdAtLocal: data.createdAtLocal.present
          ? data.createdAtLocal.value
          : this.createdAtLocal,
      status: data.status.present ? data.status.value : this.status,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChatMessageRow(')
          ..write('clientId: $clientId, ')
          ..write('serverId: $serverId, ')
          ..write('chatId: $chatId, ')
          ..write('authorId: $authorId, ')
          ..write('messageText: $messageText, ')
          ..write('attachmentIdsJson: $attachmentIdsJson, ')
          ..write('createdAtLocal: $createdAtLocal, ')
          ..write('status: $status')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(clientId, serverId, chatId, authorId,
      messageText, attachmentIdsJson, createdAtLocal, status);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChatMessageRow &&
          other.clientId == this.clientId &&
          other.serverId == this.serverId &&
          other.chatId == this.chatId &&
          other.authorId == this.authorId &&
          other.messageText == this.messageText &&
          other.attachmentIdsJson == this.attachmentIdsJson &&
          other.createdAtLocal == this.createdAtLocal &&
          other.status == this.status);
}

class ChatMessagesCompanion extends UpdateCompanion<ChatMessageRow> {
  final Value<String> clientId;
  final Value<String?> serverId;
  final Value<String> chatId;
  final Value<String?> authorId;
  final Value<String> messageText;
  final Value<String?> attachmentIdsJson;
  final Value<DateTime> createdAtLocal;
  final Value<String> status;
  final Value<int> rowid;
  const ChatMessagesCompanion({
    this.clientId = const Value.absent(),
    this.serverId = const Value.absent(),
    this.chatId = const Value.absent(),
    this.authorId = const Value.absent(),
    this.messageText = const Value.absent(),
    this.attachmentIdsJson = const Value.absent(),
    this.createdAtLocal = const Value.absent(),
    this.status = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ChatMessagesCompanion.insert({
    required String clientId,
    this.serverId = const Value.absent(),
    required String chatId,
    this.authorId = const Value.absent(),
    required String messageText,
    this.attachmentIdsJson = const Value.absent(),
    required DateTime createdAtLocal,
    this.status = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : clientId = Value(clientId),
        chatId = Value(chatId),
        messageText = Value(messageText),
        createdAtLocal = Value(createdAtLocal);
  static Insertable<ChatMessageRow> custom({
    Expression<String>? clientId,
    Expression<String>? serverId,
    Expression<String>? chatId,
    Expression<String>? authorId,
    Expression<String>? messageText,
    Expression<String>? attachmentIdsJson,
    Expression<DateTime>? createdAtLocal,
    Expression<String>? status,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (clientId != null) 'client_id': clientId,
      if (serverId != null) 'server_id': serverId,
      if (chatId != null) 'chat_id': chatId,
      if (authorId != null) 'author_id': authorId,
      if (messageText != null) 'text': messageText,
      if (attachmentIdsJson != null) 'attachment_ids_json': attachmentIdsJson,
      if (createdAtLocal != null) 'created_at_local': createdAtLocal,
      if (status != null) 'status': status,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ChatMessagesCompanion copyWith(
      {Value<String>? clientId,
      Value<String?>? serverId,
      Value<String>? chatId,
      Value<String?>? authorId,
      Value<String>? messageText,
      Value<String?>? attachmentIdsJson,
      Value<DateTime>? createdAtLocal,
      Value<String>? status,
      Value<int>? rowid}) {
    return ChatMessagesCompanion(
      clientId: clientId ?? this.clientId,
      serverId: serverId ?? this.serverId,
      chatId: chatId ?? this.chatId,
      authorId: authorId ?? this.authorId,
      messageText: messageText ?? this.messageText,
      attachmentIdsJson: attachmentIdsJson ?? this.attachmentIdsJson,
      createdAtLocal: createdAtLocal ?? this.createdAtLocal,
      status: status ?? this.status,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (chatId.present) {
      map['chat_id'] = Variable<String>(chatId.value);
    }
    if (authorId.present) {
      map['author_id'] = Variable<String>(authorId.value);
    }
    if (messageText.present) {
      map['text'] = Variable<String>(messageText.value);
    }
    if (attachmentIdsJson.present) {
      map['attachment_ids_json'] = Variable<String>(attachmentIdsJson.value);
    }
    if (createdAtLocal.present) {
      map['created_at_local'] = Variable<DateTime>(createdAtLocal.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChatMessagesCompanion(')
          ..write('clientId: $clientId, ')
          ..write('serverId: $serverId, ')
          ..write('chatId: $chatId, ')
          ..write('authorId: $authorId, ')
          ..write('messageText: $messageText, ')
          ..write('attachmentIdsJson: $attachmentIdsJson, ')
          ..write('createdAtLocal: $createdAtLocal, ')
          ..write('status: $status, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $PendingActionsTable pendingActions = $PendingActionsTable(this);
  late final $GpsPointsTable gpsPoints = $GpsPointsTable(this);
  late final $ShiftEventsTable shiftEvents = $ShiftEventsTable(this);
  late final $CachedObjectsTable cachedObjects = $CachedObjectsTable(this);
  late final $RoutePointsTable routePoints = $RoutePointsTable(this);
  late final $ChecklistOperationsTable checklistOperations =
      $ChecklistOperationsTable(this);
  late final $CachedRoomsTable cachedRooms = $CachedRoomsTable(this);
  late final $CachedTechCardsTable cachedTechCards =
      $CachedTechCardsTable(this);
  late final $CachedTicketsTable cachedTickets = $CachedTicketsTable(this);
  late final $ChatMessagesTable chatMessages = $ChatMessagesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        pendingActions,
        gpsPoints,
        shiftEvents,
        cachedObjects,
        routePoints,
        checklistOperations,
        cachedRooms,
        cachedTechCards,
        cachedTickets,
        chatMessages
      ];
}

typedef $$PendingActionsTableCreateCompanionBuilder = PendingActionsCompanion
    Function({
  required String id,
  required String kind,
  required String payloadJson,
  Value<String?> idempotencyKey,
  Value<String> status,
  Value<int> attempts,
  Value<String?> lastError,
  Value<DateTime?> nextAttemptAt,
  required DateTime createdAt,
  Value<DateTime?> syncedAt,
  Value<int> rowid,
});
typedef $$PendingActionsTableUpdateCompanionBuilder = PendingActionsCompanion
    Function({
  Value<String> id,
  Value<String> kind,
  Value<String> payloadJson,
  Value<String?> idempotencyKey,
  Value<String> status,
  Value<int> attempts,
  Value<String?> lastError,
  Value<DateTime?> nextAttemptAt,
  Value<DateTime> createdAt,
  Value<DateTime?> syncedAt,
  Value<int> rowid,
});

class $$PendingActionsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $PendingActionsTable,
    PendingActionRow,
    $$PendingActionsTableFilterComposer,
    $$PendingActionsTableOrderingComposer,
    $$PendingActionsTableCreateCompanionBuilder,
    $$PendingActionsTableUpdateCompanionBuilder> {
  $$PendingActionsTableTableManager(
      _$AppDatabase db, $PendingActionsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$PendingActionsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$PendingActionsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<String> payloadJson = const Value.absent(),
            Value<String?> idempotencyKey = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<DateTime?> nextAttemptAt = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<DateTime?> syncedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingActionsCompanion(
            id: id,
            kind: kind,
            payloadJson: payloadJson,
            idempotencyKey: idempotencyKey,
            status: status,
            attempts: attempts,
            lastError: lastError,
            nextAttemptAt: nextAttemptAt,
            createdAt: createdAt,
            syncedAt: syncedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String kind,
            required String payloadJson,
            Value<String?> idempotencyKey = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<DateTime?> nextAttemptAt = const Value.absent(),
            required DateTime createdAt,
            Value<DateTime?> syncedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingActionsCompanion.insert(
            id: id,
            kind: kind,
            payloadJson: payloadJson,
            idempotencyKey: idempotencyKey,
            status: status,
            attempts: attempts,
            lastError: lastError,
            nextAttemptAt: nextAttemptAt,
            createdAt: createdAt,
            syncedAt: syncedAt,
            rowid: rowid,
          ),
        ));
}

class $$PendingActionsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $PendingActionsTable> {
  $$PendingActionsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get kind => $state.composableBuilder(
      column: $state.table.kind,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get payloadJson => $state.composableBuilder(
      column: $state.table.payloadJson,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get idempotencyKey => $state.composableBuilder(
      column: $state.table.idempotencyKey,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get attempts => $state.composableBuilder(
      column: $state.table.attempts,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get lastError => $state.composableBuilder(
      column: $state.table.lastError,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get nextAttemptAt => $state.composableBuilder(
      column: $state.table.nextAttemptAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get createdAt => $state.composableBuilder(
      column: $state.table.createdAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get syncedAt => $state.composableBuilder(
      column: $state.table.syncedAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$PendingActionsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $PendingActionsTable> {
  $$PendingActionsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get kind => $state.composableBuilder(
      column: $state.table.kind,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get payloadJson => $state.composableBuilder(
      column: $state.table.payloadJson,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get idempotencyKey => $state.composableBuilder(
      column: $state.table.idempotencyKey,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get attempts => $state.composableBuilder(
      column: $state.table.attempts,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get lastError => $state.composableBuilder(
      column: $state.table.lastError,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get nextAttemptAt => $state.composableBuilder(
      column: $state.table.nextAttemptAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get createdAt => $state.composableBuilder(
      column: $state.table.createdAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get syncedAt => $state.composableBuilder(
      column: $state.table.syncedAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$GpsPointsTableCreateCompanionBuilder = GpsPointsCompanion Function({
  Value<int> id,
  required double lat,
  required double lng,
  Value<double?> accuracy,
  Value<double?> speed,
  Value<int?> battery,
  required DateTime timestamp,
  Value<bool> synced,
});
typedef $$GpsPointsTableUpdateCompanionBuilder = GpsPointsCompanion Function({
  Value<int> id,
  Value<double> lat,
  Value<double> lng,
  Value<double?> accuracy,
  Value<double?> speed,
  Value<int?> battery,
  Value<DateTime> timestamp,
  Value<bool> synced,
});

class $$GpsPointsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $GpsPointsTable,
    GpsPointRow,
    $$GpsPointsTableFilterComposer,
    $$GpsPointsTableOrderingComposer,
    $$GpsPointsTableCreateCompanionBuilder,
    $$GpsPointsTableUpdateCompanionBuilder> {
  $$GpsPointsTableTableManager(_$AppDatabase db, $GpsPointsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$GpsPointsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$GpsPointsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<double> lat = const Value.absent(),
            Value<double> lng = const Value.absent(),
            Value<double?> accuracy = const Value.absent(),
            Value<double?> speed = const Value.absent(),
            Value<int?> battery = const Value.absent(),
            Value<DateTime> timestamp = const Value.absent(),
            Value<bool> synced = const Value.absent(),
          }) =>
              GpsPointsCompanion(
            id: id,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            speed: speed,
            battery: battery,
            timestamp: timestamp,
            synced: synced,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required double lat,
            required double lng,
            Value<double?> accuracy = const Value.absent(),
            Value<double?> speed = const Value.absent(),
            Value<int?> battery = const Value.absent(),
            required DateTime timestamp,
            Value<bool> synced = const Value.absent(),
          }) =>
              GpsPointsCompanion.insert(
            id: id,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            speed: speed,
            battery: battery,
            timestamp: timestamp,
            synced: synced,
          ),
        ));
}

class $$GpsPointsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $GpsPointsTable> {
  $$GpsPointsTableFilterComposer(super.$state);
  ColumnFilters<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get lat => $state.composableBuilder(
      column: $state.table.lat,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get lng => $state.composableBuilder(
      column: $state.table.lng,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get accuracy => $state.composableBuilder(
      column: $state.table.accuracy,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get speed => $state.composableBuilder(
      column: $state.table.speed,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get battery => $state.composableBuilder(
      column: $state.table.battery,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get timestamp => $state.composableBuilder(
      column: $state.table.timestamp,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<bool> get synced => $state.composableBuilder(
      column: $state.table.synced,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$GpsPointsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $GpsPointsTable> {
  $$GpsPointsTableOrderingComposer(super.$state);
  ColumnOrderings<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get lat => $state.composableBuilder(
      column: $state.table.lat,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get lng => $state.composableBuilder(
      column: $state.table.lng,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get accuracy => $state.composableBuilder(
      column: $state.table.accuracy,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get speed => $state.composableBuilder(
      column: $state.table.speed,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get battery => $state.composableBuilder(
      column: $state.table.battery,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get timestamp => $state.composableBuilder(
      column: $state.table.timestamp,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<bool> get synced => $state.composableBuilder(
      column: $state.table.synced,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$ShiftEventsTableCreateCompanionBuilder = ShiftEventsCompanion
    Function({
  required String id,
  Value<String?> scheduleId,
  required String scheduleName,
  Value<String?> objectId,
  Value<String?> routeId,
  Value<String?> date,
  Value<String?> plannedStart,
  required String status,
  Value<String?> ticketId,
  Value<String?> checkOutReason,
  required DateTime updatedAt,
  Value<int> rowid,
});
typedef $$ShiftEventsTableUpdateCompanionBuilder = ShiftEventsCompanion
    Function({
  Value<String> id,
  Value<String?> scheduleId,
  Value<String> scheduleName,
  Value<String?> objectId,
  Value<String?> routeId,
  Value<String?> date,
  Value<String?> plannedStart,
  Value<String> status,
  Value<String?> ticketId,
  Value<String?> checkOutReason,
  Value<DateTime> updatedAt,
  Value<int> rowid,
});

class $$ShiftEventsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ShiftEventsTable,
    ShiftEventRow,
    $$ShiftEventsTableFilterComposer,
    $$ShiftEventsTableOrderingComposer,
    $$ShiftEventsTableCreateCompanionBuilder,
    $$ShiftEventsTableUpdateCompanionBuilder> {
  $$ShiftEventsTableTableManager(_$AppDatabase db, $ShiftEventsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$ShiftEventsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$ShiftEventsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String?> scheduleId = const Value.absent(),
            Value<String> scheduleName = const Value.absent(),
            Value<String?> objectId = const Value.absent(),
            Value<String?> routeId = const Value.absent(),
            Value<String?> date = const Value.absent(),
            Value<String?> plannedStart = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> ticketId = const Value.absent(),
            Value<String?> checkOutReason = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ShiftEventsCompanion(
            id: id,
            scheduleId: scheduleId,
            scheduleName: scheduleName,
            objectId: objectId,
            routeId: routeId,
            date: date,
            plannedStart: plannedStart,
            status: status,
            ticketId: ticketId,
            checkOutReason: checkOutReason,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            Value<String?> scheduleId = const Value.absent(),
            required String scheduleName,
            Value<String?> objectId = const Value.absent(),
            Value<String?> routeId = const Value.absent(),
            Value<String?> date = const Value.absent(),
            Value<String?> plannedStart = const Value.absent(),
            required String status,
            Value<String?> ticketId = const Value.absent(),
            Value<String?> checkOutReason = const Value.absent(),
            required DateTime updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              ShiftEventsCompanion.insert(
            id: id,
            scheduleId: scheduleId,
            scheduleName: scheduleName,
            objectId: objectId,
            routeId: routeId,
            date: date,
            plannedStart: plannedStart,
            status: status,
            ticketId: ticketId,
            checkOutReason: checkOutReason,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
        ));
}

class $$ShiftEventsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $ShiftEventsTable> {
  $$ShiftEventsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get scheduleId => $state.composableBuilder(
      column: $state.table.scheduleId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get scheduleName => $state.composableBuilder(
      column: $state.table.scheduleName,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get objectId => $state.composableBuilder(
      column: $state.table.objectId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get routeId => $state.composableBuilder(
      column: $state.table.routeId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get date => $state.composableBuilder(
      column: $state.table.date,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get plannedStart => $state.composableBuilder(
      column: $state.table.plannedStart,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get ticketId => $state.composableBuilder(
      column: $state.table.ticketId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get checkOutReason => $state.composableBuilder(
      column: $state.table.checkOutReason,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$ShiftEventsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $ShiftEventsTable> {
  $$ShiftEventsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get scheduleId => $state.composableBuilder(
      column: $state.table.scheduleId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get scheduleName => $state.composableBuilder(
      column: $state.table.scheduleName,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get objectId => $state.composableBuilder(
      column: $state.table.objectId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get routeId => $state.composableBuilder(
      column: $state.table.routeId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get date => $state.composableBuilder(
      column: $state.table.date,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get plannedStart => $state.composableBuilder(
      column: $state.table.plannedStart,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get ticketId => $state.composableBuilder(
      column: $state.table.ticketId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get checkOutReason => $state.composableBuilder(
      column: $state.table.checkOutReason,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$CachedObjectsTableCreateCompanionBuilder = CachedObjectsCompanion
    Function({
  required String id,
  required String name,
  Value<String?> address,
  Value<double?> lat,
  Value<double?> lng,
  Value<String?> status,
  required DateTime updatedAt,
  Value<int> rowid,
});
typedef $$CachedObjectsTableUpdateCompanionBuilder = CachedObjectsCompanion
    Function({
  Value<String> id,
  Value<String> name,
  Value<String?> address,
  Value<double?> lat,
  Value<double?> lng,
  Value<String?> status,
  Value<DateTime> updatedAt,
  Value<int> rowid,
});

class $$CachedObjectsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedObjectsTable,
    CachedObjectRow,
    $$CachedObjectsTableFilterComposer,
    $$CachedObjectsTableOrderingComposer,
    $$CachedObjectsTableCreateCompanionBuilder,
    $$CachedObjectsTableUpdateCompanionBuilder> {
  $$CachedObjectsTableTableManager(_$AppDatabase db, $CachedObjectsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$CachedObjectsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$CachedObjectsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String?> address = const Value.absent(),
            Value<double?> lat = const Value.absent(),
            Value<double?> lng = const Value.absent(),
            Value<String?> status = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedObjectsCompanion(
            id: id,
            name: name,
            address: address,
            lat: lat,
            lng: lng,
            status: status,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String name,
            Value<String?> address = const Value.absent(),
            Value<double?> lat = const Value.absent(),
            Value<double?> lng = const Value.absent(),
            Value<String?> status = const Value.absent(),
            required DateTime updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedObjectsCompanion.insert(
            id: id,
            name: name,
            address: address,
            lat: lat,
            lng: lng,
            status: status,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
        ));
}

class $$CachedObjectsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $CachedObjectsTable> {
  $$CachedObjectsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get address => $state.composableBuilder(
      column: $state.table.address,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get lat => $state.composableBuilder(
      column: $state.table.lat,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get lng => $state.composableBuilder(
      column: $state.table.lng,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$CachedObjectsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $CachedObjectsTable> {
  $$CachedObjectsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get address => $state.composableBuilder(
      column: $state.table.address,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get lat => $state.composableBuilder(
      column: $state.table.lat,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get lng => $state.composableBuilder(
      column: $state.table.lng,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$RoutePointsTableCreateCompanionBuilder = RoutePointsCompanion
    Function({
  required String pointId,
  required String eventId,
  required String routeId,
  required String roomId,
  Value<int> orderIndex,
  Value<int?> estimatedTimeMin,
  Value<String> status,
  Value<String?> skippedReason,
  Value<DateTime?> completedAtLocal,
  Value<int> rowid,
});
typedef $$RoutePointsTableUpdateCompanionBuilder = RoutePointsCompanion
    Function({
  Value<String> pointId,
  Value<String> eventId,
  Value<String> routeId,
  Value<String> roomId,
  Value<int> orderIndex,
  Value<int?> estimatedTimeMin,
  Value<String> status,
  Value<String?> skippedReason,
  Value<DateTime?> completedAtLocal,
  Value<int> rowid,
});

class $$RoutePointsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $RoutePointsTable,
    RoutePointRow,
    $$RoutePointsTableFilterComposer,
    $$RoutePointsTableOrderingComposer,
    $$RoutePointsTableCreateCompanionBuilder,
    $$RoutePointsTableUpdateCompanionBuilder> {
  $$RoutePointsTableTableManager(_$AppDatabase db, $RoutePointsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$RoutePointsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$RoutePointsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> pointId = const Value.absent(),
            Value<String> eventId = const Value.absent(),
            Value<String> routeId = const Value.absent(),
            Value<String> roomId = const Value.absent(),
            Value<int> orderIndex = const Value.absent(),
            Value<int?> estimatedTimeMin = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> skippedReason = const Value.absent(),
            Value<DateTime?> completedAtLocal = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RoutePointsCompanion(
            pointId: pointId,
            eventId: eventId,
            routeId: routeId,
            roomId: roomId,
            orderIndex: orderIndex,
            estimatedTimeMin: estimatedTimeMin,
            status: status,
            skippedReason: skippedReason,
            completedAtLocal: completedAtLocal,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String pointId,
            required String eventId,
            required String routeId,
            required String roomId,
            Value<int> orderIndex = const Value.absent(),
            Value<int?> estimatedTimeMin = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> skippedReason = const Value.absent(),
            Value<DateTime?> completedAtLocal = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RoutePointsCompanion.insert(
            pointId: pointId,
            eventId: eventId,
            routeId: routeId,
            roomId: roomId,
            orderIndex: orderIndex,
            estimatedTimeMin: estimatedTimeMin,
            status: status,
            skippedReason: skippedReason,
            completedAtLocal: completedAtLocal,
            rowid: rowid,
          ),
        ));
}

class $$RoutePointsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $RoutePointsTable> {
  $$RoutePointsTableFilterComposer(super.$state);
  ColumnFilters<String> get pointId => $state.composableBuilder(
      column: $state.table.pointId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get eventId => $state.composableBuilder(
      column: $state.table.eventId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get routeId => $state.composableBuilder(
      column: $state.table.routeId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get orderIndex => $state.composableBuilder(
      column: $state.table.orderIndex,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get estimatedTimeMin => $state.composableBuilder(
      column: $state.table.estimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get skippedReason => $state.composableBuilder(
      column: $state.table.skippedReason,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get completedAtLocal => $state.composableBuilder(
      column: $state.table.completedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$RoutePointsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $RoutePointsTable> {
  $$RoutePointsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get pointId => $state.composableBuilder(
      column: $state.table.pointId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get eventId => $state.composableBuilder(
      column: $state.table.eventId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get routeId => $state.composableBuilder(
      column: $state.table.routeId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get orderIndex => $state.composableBuilder(
      column: $state.table.orderIndex,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get estimatedTimeMin => $state.composableBuilder(
      column: $state.table.estimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get skippedReason => $state.composableBuilder(
      column: $state.table.skippedReason,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get completedAtLocal => $state.composableBuilder(
      column: $state.table.completedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$ChecklistOperationsTableCreateCompanionBuilder
    = ChecklistOperationsCompanion Function({
  required String operationId,
  required String roomId,
  Value<String?> ticketId,
  Value<int> orderIndex,
  required String name,
  Value<String?> description,
  Value<String?> equipmentJson,
  Value<int?> estimatedTimeMin,
  Value<bool> requiresPhoto,
  Value<bool> requiresQr,
  Value<DateTime?> startedAtLocal,
  Value<DateTime?> completedAtLocal,
  Value<String?> photoLocalPath,
  Value<String?> photoFileId,
  Value<String?> photoUrl,
  Value<String> syncStatus,
  Value<int> rowid,
});
typedef $$ChecklistOperationsTableUpdateCompanionBuilder
    = ChecklistOperationsCompanion Function({
  Value<String> operationId,
  Value<String> roomId,
  Value<String?> ticketId,
  Value<int> orderIndex,
  Value<String> name,
  Value<String?> description,
  Value<String?> equipmentJson,
  Value<int?> estimatedTimeMin,
  Value<bool> requiresPhoto,
  Value<bool> requiresQr,
  Value<DateTime?> startedAtLocal,
  Value<DateTime?> completedAtLocal,
  Value<String?> photoLocalPath,
  Value<String?> photoFileId,
  Value<String?> photoUrl,
  Value<String> syncStatus,
  Value<int> rowid,
});

class $$ChecklistOperationsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ChecklistOperationsTable,
    ChecklistOperationRow,
    $$ChecklistOperationsTableFilterComposer,
    $$ChecklistOperationsTableOrderingComposer,
    $$ChecklistOperationsTableCreateCompanionBuilder,
    $$ChecklistOperationsTableUpdateCompanionBuilder> {
  $$ChecklistOperationsTableTableManager(
      _$AppDatabase db, $ChecklistOperationsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer: $$ChecklistOperationsTableFilterComposer(
              ComposerState(db, table)),
          orderingComposer: $$ChecklistOperationsTableOrderingComposer(
              ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> operationId = const Value.absent(),
            Value<String> roomId = const Value.absent(),
            Value<String?> ticketId = const Value.absent(),
            Value<int> orderIndex = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String?> description = const Value.absent(),
            Value<String?> equipmentJson = const Value.absent(),
            Value<int?> estimatedTimeMin = const Value.absent(),
            Value<bool> requiresPhoto = const Value.absent(),
            Value<bool> requiresQr = const Value.absent(),
            Value<DateTime?> startedAtLocal = const Value.absent(),
            Value<DateTime?> completedAtLocal = const Value.absent(),
            Value<String?> photoLocalPath = const Value.absent(),
            Value<String?> photoFileId = const Value.absent(),
            Value<String?> photoUrl = const Value.absent(),
            Value<String> syncStatus = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ChecklistOperationsCompanion(
            operationId: operationId,
            roomId: roomId,
            ticketId: ticketId,
            orderIndex: orderIndex,
            name: name,
            description: description,
            equipmentJson: equipmentJson,
            estimatedTimeMin: estimatedTimeMin,
            requiresPhoto: requiresPhoto,
            requiresQr: requiresQr,
            startedAtLocal: startedAtLocal,
            completedAtLocal: completedAtLocal,
            photoLocalPath: photoLocalPath,
            photoFileId: photoFileId,
            photoUrl: photoUrl,
            syncStatus: syncStatus,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String operationId,
            required String roomId,
            Value<String?> ticketId = const Value.absent(),
            Value<int> orderIndex = const Value.absent(),
            required String name,
            Value<String?> description = const Value.absent(),
            Value<String?> equipmentJson = const Value.absent(),
            Value<int?> estimatedTimeMin = const Value.absent(),
            Value<bool> requiresPhoto = const Value.absent(),
            Value<bool> requiresQr = const Value.absent(),
            Value<DateTime?> startedAtLocal = const Value.absent(),
            Value<DateTime?> completedAtLocal = const Value.absent(),
            Value<String?> photoLocalPath = const Value.absent(),
            Value<String?> photoFileId = const Value.absent(),
            Value<String?> photoUrl = const Value.absent(),
            Value<String> syncStatus = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ChecklistOperationsCompanion.insert(
            operationId: operationId,
            roomId: roomId,
            ticketId: ticketId,
            orderIndex: orderIndex,
            name: name,
            description: description,
            equipmentJson: equipmentJson,
            estimatedTimeMin: estimatedTimeMin,
            requiresPhoto: requiresPhoto,
            requiresQr: requiresQr,
            startedAtLocal: startedAtLocal,
            completedAtLocal: completedAtLocal,
            photoLocalPath: photoLocalPath,
            photoFileId: photoFileId,
            photoUrl: photoUrl,
            syncStatus: syncStatus,
            rowid: rowid,
          ),
        ));
}

class $$ChecklistOperationsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $ChecklistOperationsTable> {
  $$ChecklistOperationsTableFilterComposer(super.$state);
  ColumnFilters<String> get operationId => $state.composableBuilder(
      column: $state.table.operationId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get ticketId => $state.composableBuilder(
      column: $state.table.ticketId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get orderIndex => $state.composableBuilder(
      column: $state.table.orderIndex,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get equipmentJson => $state.composableBuilder(
      column: $state.table.equipmentJson,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get estimatedTimeMin => $state.composableBuilder(
      column: $state.table.estimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<bool> get requiresPhoto => $state.composableBuilder(
      column: $state.table.requiresPhoto,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<bool> get requiresQr => $state.composableBuilder(
      column: $state.table.requiresQr,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get startedAtLocal => $state.composableBuilder(
      column: $state.table.startedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get completedAtLocal => $state.composableBuilder(
      column: $state.table.completedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get photoLocalPath => $state.composableBuilder(
      column: $state.table.photoLocalPath,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get photoFileId => $state.composableBuilder(
      column: $state.table.photoFileId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get photoUrl => $state.composableBuilder(
      column: $state.table.photoUrl,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get syncStatus => $state.composableBuilder(
      column: $state.table.syncStatus,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$ChecklistOperationsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $ChecklistOperationsTable> {
  $$ChecklistOperationsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get operationId => $state.composableBuilder(
      column: $state.table.operationId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get ticketId => $state.composableBuilder(
      column: $state.table.ticketId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get orderIndex => $state.composableBuilder(
      column: $state.table.orderIndex,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get equipmentJson => $state.composableBuilder(
      column: $state.table.equipmentJson,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get estimatedTimeMin => $state.composableBuilder(
      column: $state.table.estimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<bool> get requiresPhoto => $state.composableBuilder(
      column: $state.table.requiresPhoto,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<bool> get requiresQr => $state.composableBuilder(
      column: $state.table.requiresQr,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get startedAtLocal => $state.composableBuilder(
      column: $state.table.startedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get completedAtLocal => $state.composableBuilder(
      column: $state.table.completedAtLocal,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get photoLocalPath => $state.composableBuilder(
      column: $state.table.photoLocalPath,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get photoFileId => $state.composableBuilder(
      column: $state.table.photoFileId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get photoUrl => $state.composableBuilder(
      column: $state.table.photoUrl,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get syncStatus => $state.composableBuilder(
      column: $state.table.syncStatus,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$CachedRoomsTableCreateCompanionBuilder = CachedRoomsCompanion
    Function({
  required String id,
  Value<String?> floorId,
  required String name,
  Value<double?> areaM2,
  Value<String?> floorType,
  Value<String?> zone,
  Value<String?> techCardId,
  Value<int?> coordsX,
  Value<int?> coordsY,
  Value<int?> coordsWidth,
  Value<int?> coordsHeight,
  Value<int> rowid,
});
typedef $$CachedRoomsTableUpdateCompanionBuilder = CachedRoomsCompanion
    Function({
  Value<String> id,
  Value<String?> floorId,
  Value<String> name,
  Value<double?> areaM2,
  Value<String?> floorType,
  Value<String?> zone,
  Value<String?> techCardId,
  Value<int?> coordsX,
  Value<int?> coordsY,
  Value<int?> coordsWidth,
  Value<int?> coordsHeight,
  Value<int> rowid,
});

class $$CachedRoomsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedRoomsTable,
    CachedRoomRow,
    $$CachedRoomsTableFilterComposer,
    $$CachedRoomsTableOrderingComposer,
    $$CachedRoomsTableCreateCompanionBuilder,
    $$CachedRoomsTableUpdateCompanionBuilder> {
  $$CachedRoomsTableTableManager(_$AppDatabase db, $CachedRoomsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$CachedRoomsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$CachedRoomsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String?> floorId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<double?> areaM2 = const Value.absent(),
            Value<String?> floorType = const Value.absent(),
            Value<String?> zone = const Value.absent(),
            Value<String?> techCardId = const Value.absent(),
            Value<int?> coordsX = const Value.absent(),
            Value<int?> coordsY = const Value.absent(),
            Value<int?> coordsWidth = const Value.absent(),
            Value<int?> coordsHeight = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedRoomsCompanion(
            id: id,
            floorId: floorId,
            name: name,
            areaM2: areaM2,
            floorType: floorType,
            zone: zone,
            techCardId: techCardId,
            coordsX: coordsX,
            coordsY: coordsY,
            coordsWidth: coordsWidth,
            coordsHeight: coordsHeight,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            Value<String?> floorId = const Value.absent(),
            required String name,
            Value<double?> areaM2 = const Value.absent(),
            Value<String?> floorType = const Value.absent(),
            Value<String?> zone = const Value.absent(),
            Value<String?> techCardId = const Value.absent(),
            Value<int?> coordsX = const Value.absent(),
            Value<int?> coordsY = const Value.absent(),
            Value<int?> coordsWidth = const Value.absent(),
            Value<int?> coordsHeight = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedRoomsCompanion.insert(
            id: id,
            floorId: floorId,
            name: name,
            areaM2: areaM2,
            floorType: floorType,
            zone: zone,
            techCardId: techCardId,
            coordsX: coordsX,
            coordsY: coordsY,
            coordsWidth: coordsWidth,
            coordsHeight: coordsHeight,
            rowid: rowid,
          ),
        ));
}

class $$CachedRoomsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $CachedRoomsTable> {
  $$CachedRoomsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get floorId => $state.composableBuilder(
      column: $state.table.floorId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get areaM2 => $state.composableBuilder(
      column: $state.table.areaM2,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get floorType => $state.composableBuilder(
      column: $state.table.floorType,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get zone => $state.composableBuilder(
      column: $state.table.zone,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get techCardId => $state.composableBuilder(
      column: $state.table.techCardId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get coordsX => $state.composableBuilder(
      column: $state.table.coordsX,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get coordsY => $state.composableBuilder(
      column: $state.table.coordsY,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get coordsWidth => $state.composableBuilder(
      column: $state.table.coordsWidth,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get coordsHeight => $state.composableBuilder(
      column: $state.table.coordsHeight,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$CachedRoomsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $CachedRoomsTable> {
  $$CachedRoomsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get floorId => $state.composableBuilder(
      column: $state.table.floorId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get areaM2 => $state.composableBuilder(
      column: $state.table.areaM2,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get floorType => $state.composableBuilder(
      column: $state.table.floorType,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get zone => $state.composableBuilder(
      column: $state.table.zone,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get techCardId => $state.composableBuilder(
      column: $state.table.techCardId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get coordsX => $state.composableBuilder(
      column: $state.table.coordsX,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get coordsY => $state.composableBuilder(
      column: $state.table.coordsY,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get coordsWidth => $state.composableBuilder(
      column: $state.table.coordsWidth,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get coordsHeight => $state.composableBuilder(
      column: $state.table.coordsHeight,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$CachedTechCardsTableCreateCompanionBuilder = CachedTechCardsCompanion
    Function({
  required String id,
  required String name,
  required String operationsJson,
  Value<int> totalEstimatedTimeMin,
  required DateTime updatedAt,
  Value<int> rowid,
});
typedef $$CachedTechCardsTableUpdateCompanionBuilder = CachedTechCardsCompanion
    Function({
  Value<String> id,
  Value<String> name,
  Value<String> operationsJson,
  Value<int> totalEstimatedTimeMin,
  Value<DateTime> updatedAt,
  Value<int> rowid,
});

class $$CachedTechCardsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedTechCardsTable,
    CachedTechCardRow,
    $$CachedTechCardsTableFilterComposer,
    $$CachedTechCardsTableOrderingComposer,
    $$CachedTechCardsTableCreateCompanionBuilder,
    $$CachedTechCardsTableUpdateCompanionBuilder> {
  $$CachedTechCardsTableTableManager(
      _$AppDatabase db, $CachedTechCardsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$CachedTechCardsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$CachedTechCardsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> operationsJson = const Value.absent(),
            Value<int> totalEstimatedTimeMin = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedTechCardsCompanion(
            id: id,
            name: name,
            operationsJson: operationsJson,
            totalEstimatedTimeMin: totalEstimatedTimeMin,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String name,
            required String operationsJson,
            Value<int> totalEstimatedTimeMin = const Value.absent(),
            required DateTime updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedTechCardsCompanion.insert(
            id: id,
            name: name,
            operationsJson: operationsJson,
            totalEstimatedTimeMin: totalEstimatedTimeMin,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
        ));
}

class $$CachedTechCardsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $CachedTechCardsTable> {
  $$CachedTechCardsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get operationsJson => $state.composableBuilder(
      column: $state.table.operationsJson,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get totalEstimatedTimeMin => $state.composableBuilder(
      column: $state.table.totalEstimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$CachedTechCardsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $CachedTechCardsTable> {
  $$CachedTechCardsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get operationsJson => $state.composableBuilder(
      column: $state.table.operationsJson,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get totalEstimatedTimeMin => $state.composableBuilder(
      column: $state.table.totalEstimatedTimeMin,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$CachedTicketsTableCreateCompanionBuilder = CachedTicketsCompanion
    Function({
  required String id,
  required String type,
  required String priority,
  required String status,
  Value<String?> description,
  Value<String?> roomId,
  Value<String?> completionDeadline,
  Value<int?> operationsCompleted,
  required DateTime updatedAt,
  Value<int> rowid,
});
typedef $$CachedTicketsTableUpdateCompanionBuilder = CachedTicketsCompanion
    Function({
  Value<String> id,
  Value<String> type,
  Value<String> priority,
  Value<String> status,
  Value<String?> description,
  Value<String?> roomId,
  Value<String?> completionDeadline,
  Value<int?> operationsCompleted,
  Value<DateTime> updatedAt,
  Value<int> rowid,
});

class $$CachedTicketsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedTicketsTable,
    CachedTicketRow,
    $$CachedTicketsTableFilterComposer,
    $$CachedTicketsTableOrderingComposer,
    $$CachedTicketsTableCreateCompanionBuilder,
    $$CachedTicketsTableUpdateCompanionBuilder> {
  $$CachedTicketsTableTableManager(_$AppDatabase db, $CachedTicketsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$CachedTicketsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$CachedTicketsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String> priority = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> description = const Value.absent(),
            Value<String?> roomId = const Value.absent(),
            Value<String?> completionDeadline = const Value.absent(),
            Value<int?> operationsCompleted = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedTicketsCompanion(
            id: id,
            type: type,
            priority: priority,
            status: status,
            description: description,
            roomId: roomId,
            completionDeadline: completionDeadline,
            operationsCompleted: operationsCompleted,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String type,
            required String priority,
            required String status,
            Value<String?> description = const Value.absent(),
            Value<String?> roomId = const Value.absent(),
            Value<String?> completionDeadline = const Value.absent(),
            Value<int?> operationsCompleted = const Value.absent(),
            required DateTime updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedTicketsCompanion.insert(
            id: id,
            type: type,
            priority: priority,
            status: status,
            description: description,
            roomId: roomId,
            completionDeadline: completionDeadline,
            operationsCompleted: operationsCompleted,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
        ));
}

class $$CachedTicketsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $CachedTicketsTable> {
  $$CachedTicketsTableFilterComposer(super.$state);
  ColumnFilters<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get type => $state.composableBuilder(
      column: $state.table.type,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get priority => $state.composableBuilder(
      column: $state.table.priority,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get completionDeadline => $state.composableBuilder(
      column: $state.table.completionDeadline,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get operationsCompleted => $state.composableBuilder(
      column: $state.table.operationsCompleted,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$CachedTicketsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $CachedTicketsTable> {
  $$CachedTicketsTableOrderingComposer(super.$state);
  ColumnOrderings<String> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get type => $state.composableBuilder(
      column: $state.table.type,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get priority => $state.composableBuilder(
      column: $state.table.priority,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get roomId => $state.composableBuilder(
      column: $state.table.roomId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get completionDeadline => $state.composableBuilder(
      column: $state.table.completionDeadline,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get operationsCompleted => $state.composableBuilder(
      column: $state.table.operationsCompleted,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get updatedAt => $state.composableBuilder(
      column: $state.table.updatedAt,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$ChatMessagesTableCreateCompanionBuilder = ChatMessagesCompanion
    Function({
  required String clientId,
  Value<String?> serverId,
  required String chatId,
  Value<String?> authorId,
  required String messageText,
  Value<String?> attachmentIdsJson,
  required DateTime createdAtLocal,
  Value<String> status,
  Value<int> rowid,
});
typedef $$ChatMessagesTableUpdateCompanionBuilder = ChatMessagesCompanion
    Function({
  Value<String> clientId,
  Value<String?> serverId,
  Value<String> chatId,
  Value<String?> authorId,
  Value<String> messageText,
  Value<String?> attachmentIdsJson,
  Value<DateTime> createdAtLocal,
  Value<String> status,
  Value<int> rowid,
});

class $$ChatMessagesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ChatMessagesTable,
    ChatMessageRow,
    $$ChatMessagesTableFilterComposer,
    $$ChatMessagesTableOrderingComposer,
    $$ChatMessagesTableCreateCompanionBuilder,
    $$ChatMessagesTableUpdateCompanionBuilder> {
  $$ChatMessagesTableTableManager(_$AppDatabase db, $ChatMessagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$ChatMessagesTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$ChatMessagesTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> clientId = const Value.absent(),
            Value<String?> serverId = const Value.absent(),
            Value<String> chatId = const Value.absent(),
            Value<String?> authorId = const Value.absent(),
            Value<String> messageText = const Value.absent(),
            Value<String?> attachmentIdsJson = const Value.absent(),
            Value<DateTime> createdAtLocal = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ChatMessagesCompanion(
            clientId: clientId,
            serverId: serverId,
            chatId: chatId,
            authorId: authorId,
            messageText: messageText,
            attachmentIdsJson: attachmentIdsJson,
            createdAtLocal: createdAtLocal,
            status: status,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String clientId,
            Value<String?> serverId = const Value.absent(),
            required String chatId,
            Value<String?> authorId = const Value.absent(),
            required String messageText,
            Value<String?> attachmentIdsJson = const Value.absent(),
            required DateTime createdAtLocal,
            Value<String> status = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ChatMessagesCompanion.insert(
            clientId: clientId,
            serverId: serverId,
            chatId: chatId,
            authorId: authorId,
            messageText: messageText,
            attachmentIdsJson: attachmentIdsJson,
            createdAtLocal: createdAtLocal,
            status: status,
            rowid: rowid,
          ),
        ));
}

class $$ChatMessagesTableFilterComposer
    extends FilterComposer<_$AppDatabase, $ChatMessagesTable> {
  $$ChatMessagesTableFilterComposer(super.$state);
  ColumnFilters<String> get clientId => $state.composableBuilder(
      column: $state.table.clientId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get serverId => $state.composableBuilder(
      column: $state.table.serverId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get chatId => $state.composableBuilder(
      column: $state.table.chatId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get authorId => $state.composableBuilder(
      column: $state.table.authorId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get messageText => $state.composableBuilder(
      column: $state.table.messageText,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get attachmentIdsJson => $state.composableBuilder(
      column: $state.table.attachmentIdsJson,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<DateTime> get createdAtLocal => $state.composableBuilder(
      column: $state.table.createdAtLocal,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$ChatMessagesTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $ChatMessagesTable> {
  $$ChatMessagesTableOrderingComposer(super.$state);
  ColumnOrderings<String> get clientId => $state.composableBuilder(
      column: $state.table.clientId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get serverId => $state.composableBuilder(
      column: $state.table.serverId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get chatId => $state.composableBuilder(
      column: $state.table.chatId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get authorId => $state.composableBuilder(
      column: $state.table.authorId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get messageText => $state.composableBuilder(
      column: $state.table.messageText,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get attachmentIdsJson => $state.composableBuilder(
      column: $state.table.attachmentIdsJson,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<DateTime> get createdAtLocal => $state.composableBuilder(
      column: $state.table.createdAtLocal,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get status => $state.composableBuilder(
      column: $state.table.status,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$PendingActionsTableTableManager get pendingActions =>
      $$PendingActionsTableTableManager(_db, _db.pendingActions);
  $$GpsPointsTableTableManager get gpsPoints =>
      $$GpsPointsTableTableManager(_db, _db.gpsPoints);
  $$ShiftEventsTableTableManager get shiftEvents =>
      $$ShiftEventsTableTableManager(_db, _db.shiftEvents);
  $$CachedObjectsTableTableManager get cachedObjects =>
      $$CachedObjectsTableTableManager(_db, _db.cachedObjects);
  $$RoutePointsTableTableManager get routePoints =>
      $$RoutePointsTableTableManager(_db, _db.routePoints);
  $$ChecklistOperationsTableTableManager get checklistOperations =>
      $$ChecklistOperationsTableTableManager(_db, _db.checklistOperations);
  $$CachedRoomsTableTableManager get cachedRooms =>
      $$CachedRoomsTableTableManager(_db, _db.cachedRooms);
  $$CachedTechCardsTableTableManager get cachedTechCards =>
      $$CachedTechCardsTableTableManager(_db, _db.cachedTechCards);
  $$CachedTicketsTableTableManager get cachedTickets =>
      $$CachedTicketsTableTableManager(_db, _db.cachedTickets);
  $$ChatMessagesTableTableManager get chatMessages =>
      $$ChatMessagesTableTableManager(_db, _db.chatMessages);
}
